import unicodedata

MAX_REASON_LENGTH = 500


def normalize_reason(value, *, subject, error):
    """Validate and tidy a free-text audit reason.

    Applies NFKC normalization, rejects control characters, collapses runs of
    whitespace, and enforces a non-empty value of at most MAX_REASON_LENGTH
    characters. `subject` completes "Enter a reason for ..."; `error(code,
    message)` builds the exception to raise, so each service keeps its own
    error type.
    """
    missing = f'Enter a reason for {subject}.'
    if not isinstance(value, str):
        raise error('missing_reason', missing)
    normalized = unicodedata.normalize('NFKC', value)
    if any(
        unicodedata.category(character).startswith('C') and not character.isspace()
        for character in normalized
    ):
        raise error('invalid_reason', 'Control characters are not allowed.')
    normalized = ' '.join(normalized.split())
    if not normalized:
        raise error('missing_reason', missing)
    if len(normalized) > MAX_REASON_LENGTH:
        raise error('reason_too_long', f'Reasons must be {MAX_REASON_LENGTH} characters or fewer.')
    return normalized
