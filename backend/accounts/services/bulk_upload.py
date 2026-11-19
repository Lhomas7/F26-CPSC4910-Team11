"""Bulk creation of organizations, drivers, and sponsor accounts from a text file.

Two layouts are accepted (see docs/BULK_UPLOAD.md):

* pipe-delimited text, one record per line:
  ``Type|Organization|FirstName|LastName|Email|Points|Reason`` where Type is
  ``O`` (organization), ``D`` (driver) or ``S`` (sponsor);
* CSV with a header row, where every record is a driver.

Every record is checked and applied on its own, in file order. A bad record is
reported with its line number and never stops the records around it, and a
record that fails part way is undone completely, so nothing half-created is
left behind. ``dry_run`` runs exactly the same checks and then rolls everything
back, which is how an upload is validated before it creates any data.
"""

import csv
import io
import logging
import re
import secrets
from dataclasses import dataclass, field
from threading import Thread

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage
from django.db import IntegrityError, transaction
from rest_framework import serializers

from drivers.models import Driver, DriverSponsorMembership, DriverStatusChange
from drivers.services import (
    MAX_POINT_ADJUSTMENT,
    PointAdjustmentError,
    adjust_driver_points,
)
from drivers.services.reasons import MAX_REASON_LENGTH, normalize_reason

from ..input_cleaning import (
    RESERVED_USERNAMES,
    HumanTextField,
    NameField,
    NormalizedEmailField,
)
from ..models import SponsorAccount, SponsorCompany
from . import get_account_type
from .notify import notify_driver_added
from .password_reset import build_reset_url, reset_link_lifetime_minutes

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 1024 * 1024
# Every point award emails the driver, so keep one upload comfortably inside a
# single request.
MAX_ROWS = 500
DEFAULT_POINTS_REASON = 'Bulk upload'
RAW_LINE_LIMIT = 300

PIPE_COLUMNS = ('type', 'organization', 'first_name', 'last_name', 'email', 'points', 'reason')
PIPE_HEADER = 'Type|Organization|FirstName|LastName|Email|Points|Reason'
KINDS = {'O': 'organization', 'D': 'driver', 'S': 'sponsor'}
FIELD_LABELS = {
    'type': 'Type',
    'organization': 'Organization',
    'first_name': 'First name',
    'last_name': 'Last name',
    'email': 'Email',
    'points': 'Points',
    'reason': 'Reason',
}
# Header spellings a CSV may use for each column.
CSV_COLUMN_ALIASES = {
    'organisation': 'organization',
    'org': 'organization',
    'company': 'organization',
    'firstname': 'first_name',
    'first': 'first_name',
    'lastname': 'last_name',
    'last': 'last_name',
    'e_mail': 'email',
    'email_address': 'email',
    'point': 'points',
    'point_change': 'points',
}
CSV_REQUIRED_COLUMNS = ('email', 'first_name', 'last_name')


class BulkUploadFileError(ValueError):
    """The whole file is unusable, so no record in it was looked at."""


class RowError(Exception):
    """One record cannot be applied. It is reported and the upload carries on."""

    def __init__(self, message, field=None):
        super().__init__(message)
        self.errors = [{'field': field, 'message': message}]

    @classmethod
    def from_errors(cls, errors):
        error = cls(errors[0]['message'], errors[0]['field'])
        error.errors = errors
        return error


@dataclass
class ParsedRow:
    line: int
    raw: str
    kind: str | None
    fields: dict = field(default_factory=dict)
    # Set when the line could not even be split into fields.
    error: str | None = None


# ---------------------------------------------------------------- parsing


def decode_upload(data):
    """Turn the uploaded bytes into text, or explain why the file cannot be used."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise BulkUploadFileError(
            f'The file is too large. Upload at most {MAX_UPLOAD_BYTES // 1024} KB at a time.'
        )
    if not data.strip():
        raise BulkUploadFileError('The file is empty.')
    if b'\x00' in data:
        raise BulkUploadFileError('The file must be plain text, not a spreadsheet or other format.')
    try:
        return data.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise BulkUploadFileError('The file must be plain text saved as UTF-8.') from None


def detect_format(filename, requested=None):
    """'csv' for a .csv file, otherwise 'pipe'; an explicit choice wins."""
    if requested:
        requested = str(requested).strip().lower()
        if requested not in ('pipe', 'csv'):
            raise BulkUploadFileError('The file format must be pipe or csv.')
        return requested
    return 'csv' if (filename or '').lower().endswith('.csv') else 'pipe'


def _clip(text):
    return text if len(text) <= RAW_LINE_LIMIT else text[: RAW_LINE_LIMIT - 1] + '…'


def parse_pipe_file(text):
    rows = []
    seen_content = False
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        parts = [part.strip() for part in line.split('|')]
        if not seen_content:
            seen_content = True
            # A header row is optional.
            if parts[0].casefold() == 'type':
                continue
        if len(parts) > len(PIPE_COLUMNS):
            rows.append(
                ParsedRow(
                    number,
                    _clip(line),
                    None,
                    error=(
                        f'This line has {len(parts)} fields but at most {len(PIPE_COLUMNS)} '
                        f'are allowed ({PIPE_HEADER}). A value may not contain the | character.'
                    ),
                )
            )
            continue
        parts += [''] * (len(PIPE_COLUMNS) - len(parts))
        kind = parts[0].upper()
        rows.append(ParsedRow(number, _clip(line), kind, dict(zip(PIPE_COLUMNS[1:], parts[1:]))))
    return rows


def _csv_column(name):
    key = re.sub(r'[\s-]+', '_', name.strip().casefold()).strip('_')
    return CSV_COLUMN_ALIASES.get(key, key)


def parse_csv_file(text):
    reader = csv.reader(io.StringIO(text))
    header = None
    rows = []
    try:
        for values in reader:
            if not any(value.strip() for value in values):
                continue
            if header is None:
                header = [_csv_column(value) for value in values]
                missing = [name for name in CSV_REQUIRED_COLUMNS if name not in header]
                if missing:
                    labels = ', '.join(FIELD_LABELS[name] for name in missing)
                    raise BulkUploadFileError(
                        f'The first line must be a header row. Missing column(s): {labels}.'
                    )
                continue
            if values[0].lstrip().startswith('#'):
                continue
            raw = _clip(','.join(values))
            if len(values) > len(header):
                rows.append(
                    ParsedRow(
                        reader.line_num,
                        raw,
                        None,
                        error=(
                            f'This line has {len(values)} values but the header has '
                            f'{len(header)} columns.'
                        ),
                    )
                )
                continue
            values = values + [''] * (len(header) - len(values))
            fields = {
                name: value.strip()
                for name, value in zip(header, values, strict=True)
                if name in FIELD_LABELS and name != 'type'
            }
            rows.append(ParsedRow(reader.line_num, raw, 'D', fields))
    except csv.Error as error:
        raise BulkUploadFileError(f'The CSV file could not be read: {error}.') from None
    return rows


def parse_upload(text, file_format):
    rows = parse_csv_file(text) if file_format == 'csv' else parse_pipe_file(text)
    if not rows:
        raise BulkUploadFileError('The file has no records to upload.')
    if len(rows) > MAX_ROWS:
        raise BulkUploadFileError(
            f'The file has {len(rows)} records. Upload at most {MAX_ROWS} at a time.'
        )
    return rows


# ------------------------------------------------------------- validation


class OrganizationRowSerializer(serializers.Serializer):
    organization = HumanTextField(max_length=200)


class MemberRowSerializer(serializers.Serializer):
    organization = HumanTextField(max_length=200, required=False, allow_blank=True)
    first_name = NameField()
    last_name = NameField()
    email = NormalizedEmailField(max_length=254)
    points = serializers.CharField(required=False, allow_blank=True, max_length=40)
    reason = serializers.CharField(
        required=False, allow_blank=True, trim_whitespace=False, max_length=MAX_REASON_LENGTH + 1
    )

    def validate_points(self, value):
        value = value.strip()
        if not value:
            return None
        if not re.fullmatch(r'[+-]?\d{1,9}', value):
            raise serializers.ValidationError('Points must be a whole number such as 250 or -50.')
        points = int(value)
        if points == 0:
            raise serializers.ValidationError('Points cannot be zero.')
        if abs(points) > MAX_POINT_ADJUSTMENT:
            raise serializers.ValidationError(
                f'Points cannot exceed {MAX_POINT_ADJUSTMENT:,} in either direction.'
            )
        return points

    def validate_reason(self, value):
        if not value.strip():
            return ''

        def error(code, message):
            return serializers.ValidationError(message, code=code)

        return normalize_reason(value, subject='these points', error=error)


class DriverRowSerializer(MemberRowSerializer):
    def validate(self, attrs):
        if attrs.get('reason') and attrs.get('points') is None:
            raise serializers.ValidationError(
                {'reason': 'Add Points for this reason, or leave Reason empty.'}
            )
        return attrs


class SponsorRowSerializer(MemberRowSerializer):
    def validate(self, attrs):
        if attrs.get('points') is not None or attrs.get('reason'):
            raise serializers.ValidationError(
                {'points': 'Sponsor accounts cannot receive points. Leave Points and Reason empty.'}
            )
        return attrs


def _serializer_errors(serializer):
    errors = []
    for field_name, messages in serializer.errors.items():
        if not isinstance(messages, list):
            messages = [messages]
        label = FIELD_LABELS.get(field_name, field_name.replace('_', ' ').capitalize())
        for message in messages:
            text = str(message)
            if text in ('This field may not be blank.', 'This field is required.'):
                text = f'{label} is required.'
            errors.append(
                {'field': field_name if field_name in FIELD_LABELS else None, 'message': text}
            )
    return errors


def validated_fields(serializer_class, fields):
    serializer = serializer_class(data=fields)
    if not serializer.is_valid():
        raise RowError.from_errors(_serializer_errors(serializer))
    return serializer.validated_data


# -------------------------------------------------------------- processing


def _plural(count, noun):
    return f'{count:,} {noun}{"" if count == 1 else "s"}'


@dataclass
class Outcome:
    status: str
    message: str
    subject: str


class BulkUploader:
    def __init__(self, actor):
        self.actor = actor
        self.is_admin = get_account_type(actor) == 'admin'
        self.own_company = None if self.is_admin else actor.sponsor_account.company
        self.invitations = []
        # What the record being processed would add; merged only once it commits.
        self._row_counts = {}
        self._row_invitations = []
        self.counts = {
            'organizations_created': 0,
            'drivers_created': 0,
            'drivers_added': 0,
            'sponsors_created': 0,
            'points_awarded': 0,
            'points_total': 0,
        }

    def _count(self, name, amount=1):
        self._row_counts[name] = self._row_counts.get(name, 0) + amount

    # ---- entry point

    def process(self, rows):
        handlers = {'O': self._organization, 'D': self._driver, 'S': self._sponsor}
        results = []
        for row in rows:
            results.append(self._process_row(row, handlers))
        succeeded = sum(1 for result in results if result['status'] != 'error')
        return {
            'summary': {
                'total_rows': len(results),
                'succeeded': succeeded,
                'failed': len(results) - succeeded,
                **self.counts,
                'invitations_sent': len(self.invitations),
            },
            'results': results,
        }

    def _process_row(self, row, handlers):
        base = {'line': row.line, 'type': row.kind if row.kind in KINDS else None}
        try:
            if row.error:
                raise RowError(row.error)
            handler = handlers.get(row.kind)
            if handler is None:
                raise RowError(
                    f'Unknown record type "{_clip(row.kind or "")}". Use O (organization), '
                    'D (driver), or S (sponsor).',
                    'type',
                )
            # Each record is its own transaction: a failure part way through
            # undoes that record only, and every other record still goes through.
            self._row_counts = {}
            self._row_invitations = []
            with transaction.atomic():
                outcome = handler(row)
            for name, amount in self._row_counts.items():
                self.counts[name] += amount
            self.invitations.extend(self._row_invitations)
        except RowError as error:
            return self._failed(base, row, error.errors)
        except IntegrityError:
            logger.exception('Bulk upload could not save line %s.', row.line)
            return self._failed(
                base,
                row,
                [{'field': None, 'message': 'This record could not be saved. Try it again.'}],
            )
        return {**base, 'status': outcome.status, 'subject': outcome.subject, 'message': outcome.message}

    def _failed(self, base, row, errors):
        return {
            **base,
            'status': 'error',
            'subject': None,
            'message': ' '.join(error['message'] for error in errors),
            'errors': errors,
            'raw': row.raw,
        }

    # ---- organizations

    def _find_company(self, name):
        matches = list(SponsorCompany.objects.filter(name__iexact=name).order_by('id'))
        for company in matches:
            if company.name == name:
                return company
        return matches[0] if matches else None

    def _organization(self, row):
        if not self.is_admin:
            raise RowError(
                'Only administrators can create organizations. Remove this line, or ask an '
                'administrator to upload it.',
                'type',
            )
        extra = [
            FIELD_LABELS[name]
            for name in ('first_name', 'last_name', 'email', 'points', 'reason')
            if row.fields.get(name)
        ]
        if extra:
            raise RowError(
                f'Organization lines only use the Organization column. Remove: {", ".join(extra)}.'
            )
        name = validated_fields(OrganizationRowSerializer, row.fields)['organization']
        if self._find_company(name) is not None:
            return Outcome('unchanged', 'Organization already exists; nothing to change.', name)
        SponsorCompany.objects.create(name=name)
        self._count('organizations_created')
        return Outcome('created', 'Organization created.', name)

    def _company_for(self, data):
        """The organization a driver or sponsor line belongs to, if it may use it."""
        name = data.get('organization', '')
        if not self.is_admin:
            # A sponsor can only ever add people to their own organization.
            if name and name.casefold() != self.own_company.name.casefold():
                raise RowError(
                    f'You can only add users to your own organization, {self.own_company.name}. '
                    'Leave Organization empty or enter that name.',
                    'organization',
                )
            return self.own_company
        if not name:
            raise RowError('Organization is required.', 'organization')
        company = self._find_company(name)
        if company is None:
            raise RowError(
                f'Organization "{name}" does not exist. Create it with an O line earlier in the file.',
                'organization',
            )
        return company

    # ---- accounts

    def _users_with_email(self, email):
        users = list(get_user_model().objects.filter(email__iexact=email).order_by('id')[:2])
        if len(users) > 1:
            raise RowError(
                'More than one account uses this email address. Ask an administrator to fix it.',
                'email',
            )
        return users[0] if users else None

    def _available_username(self, email):
        User = get_user_model()
        base = re.sub(r'[^A-Za-z0-9._-]', '', email.split('@', 1)[0])[:24]
        if len(base) < 3:
            base = f'{base}user'
        if base.casefold() in RESERVED_USERNAMES:
            base = f'{base}.user'
        candidate = base
        suffix = 1
        while User.objects.filter(username__iexact=candidate).exists():
            suffix += 1
            candidate = f'{base}{suffix}'
        return candidate

    def _new_user(self, data):
        user = get_user_model()(
            username=self._available_username(data['email']),
            first_name=data['first_name'],
            last_name=data['last_name'],
            email=data['email'],
            is_active=True,
        )
        # Nobody knows this password. The person chooses their own from the
        # emailed link, so no password is ever written down or sent.
        user.set_password(secrets.token_urlsafe(32))
        user.save()
        return user

    def _driver(self, row):
        data = validated_fields(DriverRowSerializer, row.fields)
        company = self._company_for(data)
        email = data['email']
        existing = self._users_with_email(email)

        if existing is None:
            user = self._new_user(data)
            driver = Driver.objects.create(user=user, name=user.get_full_name())
            membership = DriverSponsorMembership.objects.create(
                driver=driver, sponsor=company, status=DriverSponsorMembership.APPROVED
            )
            self._audit_acceptance(membership)
            self._count('drivers_created')
            status, message = 'created', f'New driver account, accepted into {company.name}.'
            invite = (user, company.name, 'driver')
        else:
            driver, status, message = self._join_existing_driver(existing, company)
            invite = None

        points = data.get('points')
        if points is not None:
            message = f'{message} {self._award_points(driver, company, points, data)}'
            status = 'created' if status == 'created' else 'updated'
        if invite:
            self._row_invitations.append(invite)
        return Outcome(status, message, email)

    def _join_existing_driver(self, user, company):
        driver = (
            Driver.objects.select_for_update()
            .select_related('user')
            .filter(user=user)
            .first()
        )
        if driver is None or not user.is_active or user.is_staff or user.is_superuser:
            raise RowError(
                'This email address is already used by an account that cannot be added as a '
                'driver.',
                'email',
            )
        membership, created = DriverSponsorMembership.objects.select_for_update().get_or_create(
            driver=driver, sponsor=company
        )
        if membership.status == DriverSponsorMembership.APPROVED:
            return driver, 'unchanged', f'Already an approved driver in {company.name}.'
        was_pending = membership.status == DriverSponsorMembership.PENDING
        membership.status = DriverSponsorMembership.APPROVED
        membership.save(update_fields=['status', 'updated_at'])
        self._audit_acceptance(membership)
        self._count('drivers_added')
        if was_pending and not created:
            return driver, 'updated', f'Pending driver accepted into {company.name}.'
        # Joining another sponsor never changes the driver's other memberships.
        transaction.on_commit(
            lambda: notify_driver_added(driver, company.name),
            robust=True,
        )
        return driver, 'updated', f'Existing driver accepted into {company.name}.'

    def _audit_acceptance(self, membership):
        DriverStatusChange.objects.create(
            driver=membership.driver,
            sponsor=membership.sponsor,
            changed_by_user=self.actor,
            action=DriverStatusChange.ASSIGNED if self.is_admin else DriverStatusChange.APPROVED,
            reason='Accepted by bulk upload.',
        )

    def _award_points(self, driver, company, points, data):
        reason = data.get('reason') or DEFAULT_POINTS_REASON
        try:
            result = adjust_driver_points(
                driver=driver,
                changed_by_user=self.actor,
                point_change=points,
                reason=reason,
                on_behalf_of_company_id=company.id if self.is_admin else None,
            )
        except PointAdjustmentError as error:
            raise RowError(error.message, 'points') from None
        self._count('points_awarded')
        self._count('points_total', points)
        verb = 'Added' if points > 0 else 'Removed'
        return f'{verb} {_plural(abs(points), "point")}; balance is now {result.balance:,}.'

    def _sponsor(self, row):
        data = validated_fields(SponsorRowSerializer, row.fields)
        company = self._company_for(data)
        email = data['email']
        if self._users_with_email(email) is not None:
            raise RowError('An account with this email address already exists.', 'email')
        user = self._new_user(data)
        SponsorAccount.objects.create(user=user, company=company)
        self._count('sponsors_created')
        self._row_invitations.append((user, company.name, 'sponsor'))
        return Outcome('created', f'New sponsor account at {company.name}.', email)


# ------------------------------------------------------------ invitations


def send_invitation_email(user, company_name, role):
    minutes = reset_link_lifetime_minutes()
    article = 'an' if role == 'administrator' else 'a'
    body = (
        f'Hello {user.first_name},\n\n'
        f'{company_name} added you to the Good Driver program as {article} {role}.\n'
        f'Your username is {user.get_username()}.\n\n'
        f'Use the link below to choose your password. It expires in {minutes} minutes and '
        'stops working once it has been used.\n\n'
        f'{build_reset_url(user)}\n\n'
        'If the link has expired, choose "Forgot password" on the sign-in page and enter this '
        'email address to get a new one.'
    )
    EmailMessage(
        subject='Your Good Driver account is ready',
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    ).send(fail_silently=False)


def _send_invitations(invitations):
    for user, company_name, role in invitations:
        try:
            send_invitation_email(user, company_name, role)
        except Exception:
            logger.exception('Could not send an account invitation email.')


def send_invitations_in_background(invitations):
    """Email the new people without making the uploader wait on the mail server.

    Everything an email needs is already on the user objects, so the thread
    never touches the database.
    """
    if invitations:
        Thread(target=_send_invitations, args=(list(invitations),), daemon=True).start()


# ------------------------------------------------------------ entry point


def run_bulk_upload(actor, *, data, filename, requested_format=None, dry_run=False):
    """Validate an uploaded file and, unless `dry_run`, create what it describes.

    Returns a report with a summary and one result per record. Raises
    BulkUploadFileError when the file as a whole cannot be used.
    """
    text = decode_upload(data)
    file_format = detect_format(filename, requested_format)
    rows = parse_upload(text, file_format)

    uploader = BulkUploader(actor)
    if dry_run:
        # The same code that creates records, undone at the end, so the preview
        # can never disagree with the real upload.
        with transaction.atomic():
            report = uploader.process(rows)
            transaction.set_rollback(True)
    else:
        report = uploader.process(rows)
        send_invitations_in_background(uploader.invitations)

    logger.info(
        'Bulk upload by user %s (%s, dry_run=%s): %s',
        actor.pk,
        file_format,
        dry_run,
        report['summary'],
    )
    return {'dry_run': dry_run, 'format': file_format, **report}
