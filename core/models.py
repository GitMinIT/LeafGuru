"""
LeafGuru — server data model.

The models mirror schemas/*.schema.json 1:1: same field names, same
enums, same JSON shapes. The client generates the ids (UUIDs) so a
record keeps its identity across adapters and export/import round-trips
are stable — the server stores that id as its primary key.

Every record belongs to a Workspace:

  * LEAFGURU_AUTH=none     -> exactly one shared workspace (self-hosted
    on a LAN: no accounts, no sign-up, the data belongs to the household)
  * LEAFGURU_AUTH=required -> one workspace per account (hosted service:
    you create the account for the customer, no open self-sign-up)

A workspace is the server-side counterpart of a browser data profile.
"""
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils.crypto import salted_hmac

#: The invitation token is a bearer secret: whoever holds the link can
#: create the account. Storing it in the clear means a database leak
#: (a dump, a stolen backup, a curious admin) hands out usable
#: account links. So only a keyed hash of the token is stored, the same
#: way Django stores its own password-reset tokens.
#:
#: The token itself is 256 bits of randomness, so a hash of it cannot
#: be brute-forced, and the lookup by hash is a plain indexed query.
INVITE_TOKEN_SALT = "leafguru.invitation"
INVITE_TOKEN_ALGORITHM = "sha256"


def hash_invite_token(raw_token):
    """Return the stored form of an invitation token."""
    return salted_hmac(
        INVITE_TOKEN_SALT, raw_token, algorithm=INVITE_TOKEN_ALGORITHM
    ).hexdigest()


class Workspace(models.Model):
    """A container for one set of grow data (== a browser data profile)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    # null -> the shared workspace (auth mode "none")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.CASCADE,
        related_name="workspaces",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "name"]
        constraints = [
            # a name is unique per owner (the shared workspace has owner=None)
            models.UniqueConstraint(
                fields=["owner", "name"], name="uniq_workspace_name_per_owner"
            ),
        ]

    def __str__(self):
        return self.name


class TimeStamped(models.Model):
    """Mixin: createdAt / updatedAt, matching the JSON schemas."""

    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True


class WorkspaceMixin(models.Model):
    """Mixin: the workspace a record belongs to."""

    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="%(class)s_records"
    )

    class Meta:
        abstract = True


# --- enum choices, mirroring the schemas exactly --------------------------

GROW_STATUS = [("planned", "Planned"), ("active", "Active"),
                ("harvested", "Harvested"), ("closed", "Closed")]
LOCATION_TYPE = [("indoor", "Indoor"), ("outdoor", "Outdoor")]
EQUIPMENT_CATEGORY = [("light", "Light"), ("pot", "Pot"), ("soil", "Soil"),
                       ("fan", "Fan"), ("filter", "Filter"),
                       ("nutrient", "Nutrient"), ("sensor", "Sensor"),
                       ("other", "Other")]
EQUIPMENT_STATUS = [("in-use", "In use"), ("stored", "Stored"),
                    ("broken", "Broken"), ("sold", "Sold")]
GENOTYPE = [("indica", "Indica"), ("sativa", "Sativa"),
            ("hybrid", "Hybrid"), ("unknown", "Unknown")]
PLANT_STAGE = [("planned", "Planned"), ("germinating", "Germinating"),
               ("seedling", "Seedling"), ("vegetative", "Vegetative"),
               ("flowering", "Flowering"), ("harvest", "Harvest"),
               ("drying", "Drying"), ("fermented", "Fermented"),
               ("cured", "Cured")]
PLANT_STATUS = [("growing", "Growing"), ("harvested", "Harvested"),
                ("dried", "Dried"), ("fermented", "Fermented"),
                ("cured", "Cured"), ("died", "Died")]
PLANT_SEX = [("unknown", "Unknown"), ("regular", "Regular"),
             ("female", "Female"), ("male", "Male")]
TASK_STATUS = [("open", "Open"), ("done", "Done"), ("skipped", "Skipped")]
TASK_PRIORITY = [("low", "Low"), ("medium", "Medium"), ("high", "High")]
TASK_STAGE_HINT = [(None, "—"), ("germinating", "Germinating"),
                    ("seedling", "Seedling"), ("vegetative", "Vegetative"),
                    ("flowering", "Flowering"), ("harvest", "Harvest"),
                    ("drying", "Drying"), ("cured", "Cured")]
STRESS_LEVEL = [(None, "—"), ("low", "Low"), ("medium", "Medium"),
                 ("high", "High")]
PHOTO_PHASE = [(None, "—"), ("seedling", "Seedling"),
               ("vegetative", "Vegetative"), ("flowering", "Flowering"),
               ("harvest", "Harvest"), ("drying", "Drying"), ("cured", "Cured")]
LOG_CATEGORY = [("watering", "Watering"), ("feeding", "Feeding"),
                ("training", "Training"), ("defoliation", "Defoliation"),
                ("treatment", "Treatment"), ("observation", "Observation"),
                ("fermentation", "Fermentation"), ("note", "Note"),
                ("other", "Other")]
MIME_TYPE = [("image/jpeg", "image/jpeg"), ("image/png", "image/png"),
              ("image/webp", "image/webp")]


class BaseRecord(TimeStamped, WorkspaceMixin):
    """Common base: uuid primary key (client-generated) + workspace."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class Grow(BaseRecord):
    name = models.CharField(max_length=120)
    status = models.CharField(max_length=20, choices=GROW_STATUS, default="planned")
    is_default = models.BooleanField(default=False)
    location_ids = models.JSONField(default=list, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "name"]
        verbose_name_plural = "grows"

    def __str__(self):
        return self.name


class Location(BaseRecord):
    name = models.CharField(max_length=120)
    type = models.CharField(max_length=20, choices=LOCATION_TYPE)
    size = models.JSONField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "locations"

    def __str__(self):
        return self.name


class Equipment(BaseRecord):
    grow = models.ForeignKey(Grow, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="equipment")
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=EQUIPMENT_CATEGORY)
    icon = models.CharField(max_length=40, null=True, blank=True)
    image = models.TextField(null=True, blank=True)
    specs = models.TextField(null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=8, null=True, blank=True)
    status = models.CharField(max_length=20, choices=EQUIPMENT_STATUS, default="stored")
    notes = models.TextField(null=True, blank=True)
    location_assignments = models.JSONField(default=list, blank=True)
    available_everywhere = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "equipment"

    def __str__(self):
        return self.name


class StrainTemplate(BaseRecord):
    name = models.CharField(max_length=120)
    breeder = models.CharField(max_length=120, null=True, blank=True)
    genotype = models.CharField(max_length=20, choices=GENOTYPE, default="unknown")
    stage_durations = models.JSONField(null=True, blank=True)
    expected_height_cm = models.FloatField(null=True, blank=True)
    characteristics = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "strain templates"

    def __str__(self):
        return self.name


class Plant(BaseRecord):
    grow = models.ForeignKey(Grow, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="plants")
    name = models.CharField(max_length=120)
    strain_template = models.ForeignKey(StrainTemplate, null=True, blank=True,
                                        on_delete=models.SET_NULL,
                                        related_name="plants")
    custom_strain = models.CharField(max_length=120, null=True, blank=True)
    sex = models.CharField(max_length=20, choices=PLANT_SEX, default="unknown")
    germination_date = models.DateField(null=True, blank=True)
    stage = models.CharField(max_length=20, choices=PLANT_STAGE, default="planned")
    location = models.ForeignKey(Location, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="plants")
    status = models.CharField(max_length=20, choices=PLANT_STATUS, default="growing")
    harvest_yield_g = models.FloatField(null=True, blank=True)
    bud_g = models.FloatField(null=True, blank=True)
    leaf_g = models.FloatField(null=True, blank=True)
    sugar_leaf_g = models.FloatField(null=True, blank=True)
    stem_g = models.FloatField(null=True, blank=True)
    smell_terpenes = models.CharField(max_length=500, null=True, blank=True)
    harvested_at = models.DateField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "plants"

    def __str__(self):
        return self.name


class StageLog(BaseRecord):
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="stage_logs")
    stage = models.CharField(max_length=20, choices=PLANT_STAGE)
    entered_at = models.DateTimeField()
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["entered_at"]
        verbose_name_plural = "stage logs"

    def __str__(self):
        return f"{self.plant_id} {self.stage}"


class Measurement(BaseRecord):
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="measurements")
    type = models.CharField(max_length=40)
    value = models.FloatField()
    unit = models.CharField(max_length=10)
    measured_at = models.DateTimeField()
    note = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["-measured_at"]
        verbose_name_plural = "measurements"

    def __str__(self):
        return f"{self.plant_id} {self.type} {self.value}{self.unit}"


class LocationChange(BaseRecord):
    plant = models.ForeignKey(Plant, on_delete=models.CASCADE, related_name="location_changes")
    from_location = models.ForeignKey(Location, null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name="moves_from")
    to_location = models.ForeignKey(Location, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name="moves_to")
    changed_at = models.DateTimeField()
    reason = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ["changed_at"]
        verbose_name_plural = "location changes"

    def __str__(self):
        return f"{self.plant_id} move"


class Task(BaseRecord):
    grow = models.ForeignKey(Grow, null=True, blank=True, on_delete=models.SET_NULL,
                             related_name="tasks")
    title = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    plant = models.ForeignKey(Plant, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="tasks")
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.SET_NULL,
                                 related_name="tasks")
    stage_hint = models.CharField(max_length=20, choices=TASK_STAGE_HINT,
                                  null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    priority = models.CharField(max_length=10, choices=TASK_PRIORITY, default="medium")
    status = models.CharField(max_length=10, choices=TASK_STATUS, default="open")
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_date", "title"]
        verbose_name_plural = "tasks"

    def __str__(self):
        return self.title


class LogEntry(BaseRecord):
    grow = models.ForeignKey(Grow, on_delete=models.CASCADE, related_name="log_entries")
    at = models.DateTimeField()
    categories = models.JSONField(default=list, blank=True)
    category = models.CharField(max_length=20, choices=LOG_CATEGORY,
                                null=True, blank=True)
    text = models.TextField()
    amount_l = models.FloatField(null=True, blank=True)
    ph = models.FloatField(null=True, blank=True)
    ec = models.FloatField(null=True, blank=True)
    temp_c = models.FloatField(null=True, blank=True)
    humidity_pct = models.FloatField(null=True, blank=True)
    product = models.CharField(max_length=200, null=True, blank=True)
    dose = models.CharField(max_length=200, null=True, blank=True)
    technique = models.CharField(max_length=120, null=True, blank=True)
    stress_level = models.CharField(max_length=10, choices=STRESS_LEVEL,
                                    null=True, blank=True)
    defoliation_style = models.CharField(max_length=120, null=True, blank=True)
    defoliation_percent = models.FloatField(null=True, blank=True)
    fermentation_note = models.TextField(null=True, blank=True)
    plant_ids = models.JSONField(default=list, blank=True)
    location = models.ForeignKey(Location, null=True, blank=True,
                                 on_delete=models.SET_NULL, related_name="log_entries")

    class Meta:
        ordering = ["-at"]
        verbose_name_plural = "log entries"

    def __str__(self):
        return self.text[:40]


class Photo(BaseRecord):
    """A photo. The bytes live in MEDIA_ROOT; the API serves them."""

    plant = models.ForeignKey(Plant, null=True, blank=True, on_delete=models.CASCADE,
                              related_name="photos")
    log_entry = models.ForeignKey(LogEntry, null=True, blank=True,
                                  on_delete=models.CASCADE, related_name="photos")
    image = models.FileField(upload_to="photos/", null=True, blank=True)
    mime_type = models.CharField(max_length=20, choices=MIME_TYPE, null=True, blank=True)
    taken_at = models.DateTimeField()
    note = models.TextField(null=True, blank=True)
    phase_tag = models.CharField(max_length=20, choices=PHOTO_PHASE,
                                 null=True, blank=True)

    class Meta:
        ordering = ["-taken_at"]
        verbose_name_plural = "photos"

    def __str__(self):
        return f"photo {self.id}"


class EntityEdit(BaseRecord):
    """The change log: every edit of a record, with a field-level diff."""

    entity = models.CharField(max_length=40)
    entity_id = models.UUIDField()
    at = models.DateTimeField()
    changes = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["at"]
        verbose_name_plural = "entity edits"

    def __str__(self):
        return f"{self.entity} {self.entity_id}"


class Invitation(models.Model):
    """
    A one-time invitation to create an account.

    The operator creates the invitation; the customer sets their own
    password via the link. The token is single-use and expires.

    Only a hash of the token is stored — see `hash_invite_token`.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=150)
    email = models.EmailField(blank=True, default="")
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    workspace_name = models.CharField(max_length=120, default="Default")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_invitations",
    )

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def find_by_token(cls, raw_token):
        """
        Look an invitation up by the token from the link.

        The token in the URL is the raw secret; the database only holds
        its hash, so the lookup hashes it and searches for that.
        """
        if not raw_token:
            return None
        return cls.objects.filter(token_hash=hash_invite_token(raw_token)).first()

    @property
    def is_used(self):
        return self.used_at is not None

    @property
    def is_expired(self):
        from django.utils import timezone

        return self.expires_at <= timezone.now()

    @property
    def is_valid(self):
        """Can this invitation still be used?"""
        return not self.is_used and not self.is_expired

    def __str__(self):
        state = "used" if self.is_used else ("expired" if self.is_expired else "open")
        return f"invite {self.username} ({state})"


# --- entity registry, shared with the API layer --------------------------

#: entity name -> (model, schema file). The order matches the bundle
#: shape of schemas/bundle.schema.json.
ENTITIES = {
    "grows": (Grow, "grow.schema.json"),
    "locations": (Location, "location.schema.json"),
    "equipment": (Equipment, "equipment.schema.json"),
    "strainTemplates": (StrainTemplate, "strain-template.schema.json"),
    "plants": (Plant, "plant.schema.json"),
    "stageLogs": (StageLog, "stage-log.schema.json"),
    "measurements": (Measurement, "measurement.schema.json"),
    "locationChanges": (LocationChange, "location-change.schema.json"),
    "tasks": (Task, "task.schema.json"),
    "logEntries": (LogEntry, "log-entry.schema.json"),
    "photos": (Photo, "photo.schema.json"),
    "entityEdits": (EntityEdit, "entity-edit.schema.json"),
}
