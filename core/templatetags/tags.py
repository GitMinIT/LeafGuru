"""
LeafGuru — template tags.

`csrf_token_header` puts the CSRF token into a <meta> tag. The browser
client reads it from there and sends it as the X-CSRFToken header on
every write request.

Without it the cookie is never set (Django only sets it when a template
touches the token), and every POST to the API would be rejected with
403 — the symptom was "the journal entry is never saved".
"""
from django import template
from django.middleware.csrf import get_token

register = template.Library()


@register.simple_tag
def csrf_token_header(request):
    """The CSRF token for this request (also sets the cookie)."""
    return get_token(request)
