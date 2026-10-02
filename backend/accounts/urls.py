from .routes.admin_users import urlpatterns as admin_user_patterns
from .routes.authentication import urlpatterns as authentication_patterns
from .routes.mfa import urlpatterns as mfa_patterns
from .routes.profiles import urlpatterns as profile_patterns
from .routes.registration import urlpatterns as registration_patterns

app_name = 'accounts'

urlpatterns = [
    *admin_user_patterns,
    *registration_patterns,
    *authentication_patterns,
    *profile_patterns,
    *mfa_patterns,
]
