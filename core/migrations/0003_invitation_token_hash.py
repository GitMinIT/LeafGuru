"""
Hash the invitation token at rest.

The token in an invitation link is a bearer secret: whoever holds the
link can create the account. It used to be stored in the clear, so a
database leak (a dump, a stolen backup, a curious admin) handed out
usable account links.

The token is now stored only as a keyed hash, the same way Django
stores its own password-reset tokens. The random token itself is
returned to the operator exactly once, when the invitation is created.
"""
from django.db import migrations, models
from django.utils.crypto import salted_hmac


def _hash_token(raw_token):
    """
    The same keyed hash the model uses.

    Inlined on purpose: a data migration should not depend on the
    current model code, which may change later.
    """
    return salted_hmac(
        "leafguru.invitation", raw_token, algorithm="sha256"
    ).hexdigest()


def hash_existing_tokens(apps, schema_editor):
    """
    Re-hash the invitations that were created before this migration.

    Their links keep working: the token in the link is unchanged, only
    the stored form changes.
    """
    Invitation = apps.get_model("core", "Invitation")
    for invite in Invitation.objects.all():
        raw = invite.token
        if raw:
            invite.token = _hash_token(raw)
            invite.save(update_fields=["token"])


def unhash_tokens(apps, schema_editor):
    """
    Reverse migration.

    The hash is one-way, so the plain token cannot be recovered —
    there is nothing to restore. The invitations simply stop working,
    which is the safe direction for a secret.
    """
    Invitation = apps.get_model("core", "Invitation")
    Invitation.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0002_invitation"),
    ]

    operations = [
        migrations.RenameField(
            model_name="invitation",
            old_name="token",
            new_name="token_hash",
        ),
        migrations.RunPython(hash_existing_tokens, unhash_tokens),
        migrations.AlterField(
            model_name="invitation",
            name="token_hash",
            field=models.CharField(db_index=True, max_length=64, unique=True),
        ),
    ]
