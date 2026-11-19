from .routes.admin_users import urlpatterns as admin_user_patterns
from .routes.authentication import urlpatterns as authentication_patterns
from .routes.bulk_upload import urlpatterns as bulk_upload_patterns
from .routes.help import urlpatterns as help_patterns
from .routes.login_attempts import urlpatterns as login_attempt_patterns
from .routes.mfa import urlpatterns as mfa_patterns
from .routes.notifications import urlpatterns as notification_patterns
from .routes.profiles import urlpatterns as profile_patterns
from .routes.registration import urlpatterns as registration_patterns
from .routes.sponsor_organization import urlpatterns as sponsor_organization_patterns

app_name = 'accounts'

urlpatterns = [
    *admin_user_patterns,
    *registration_patterns,
    *authentication_patterns,
    *profile_patterns,
    *mfa_patterns,
    *login_attempt_patterns,
    *notification_patterns,
    *sponsor_organization_patterns,
    *bulk_upload_patterns,
    *help_patterns,
]
