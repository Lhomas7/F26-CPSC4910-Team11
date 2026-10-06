from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters, sensitive_variables

# Request fields that carry credentials. Django's error reporter masks these in
# the POST section of 500 reports (debug pages and admin error emails).
SENSITIVE_POST_FIELDS = (
    'password',
    'password_confirm',
    'code',
    'fallback_code',
    'token',
)


def hide_sensitive_data(view_class):
    """Keep credentials out of Django's error reports for an APIView.

    Masks the credential fields in the request's POST data, and hides every local
    variable of the view's write handlers (validated passwords, MFA codes, TOTP
    secrets) in traceback frames. sensitive_post_parameters has to wrap dispatch,
    which still receives Django's HttpRequest; DRF's Request is not one.
    """
    for name in ('post', 'put', 'patch'):
        handler = view_class.__dict__.get(name)
        if handler is not None:
            setattr(view_class, name, sensitive_variables()(handler))
    return method_decorator(
        sensitive_post_parameters(*SENSITIVE_POST_FIELDS), name='dispatch'
    )(view_class)
