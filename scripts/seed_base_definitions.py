"""Seed base attribute definitions, need rules, and system settings.
No places, audits, evidence, or dummy records are created here.
"""
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "apps" / "api"))

from app.database import SessionLocal
from app.models.accessibility import AttributeDef, FeatureType, AttrValueType, NeedRule, RuleOperator
from app.models.operations import Setting


def seed_settings(db):
    """Seed default evidence expiry policies and consensus thresholds."""
    default_settings = {
        "evidence_expiry_days": {
            "verified": 90,
            "reported": 30,
            "temporary_barrier": 7,
            "barrier": None
        },
        "consensus_thresholds": {
            "independent_reports_required": 2,
            "min_days_to_re_audit": 14
        },
        "audit_confidence_weights": {
            "critical_step_weight": 1.0,
            "optional_step_weight": 0.5
        }
    }

    for key, value in default_settings.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if not existing:
            db.add(Setting(key=key, value=value))
            print(f"  + Added setting '{key}'")
    db.commit()


def seed_attribute_defs(db):
    """Seed standard measurement definitions."""
    definitions = [
        # Entrance
        (FeatureType.ENTRANCE, "step_count", AttrValueType.NUMBER, "", "Number of physical steps at entrance"),
        (FeatureType.ENTRANCE, "door_width_cm", AttrValueType.NUMBER, "cm", "Clear opening width of entrance door"),
        (FeatureType.ENTRANCE, "ramp_slope_pct", AttrValueType.NUMBER, "%", "Slope percentage of entrance ramp if present"),
        (FeatureType.ENTRANCE, "tactile_paving", AttrValueType.BOOLEAN, "", "Presence of tactile guide path to door"),

        # Ramp
        (FeatureType.RAMP, "slope_pct", AttrValueType.NUMBER, "%", "Slope gradient percentage"),
        (FeatureType.RAMP, "width_cm", AttrValueType.NUMBER, "cm", "Clear width of ramp"),
        (FeatureType.RAMP, "handrails", AttrValueType.BOOLEAN, "", "Continuous handrails on both sides"),

        # Lift
        (FeatureType.LIFT, "lift_working", AttrValueType.BOOLEAN, "", "Whether the elevator is currently functional"),
        (FeatureType.LIFT, "door_width_cm", AttrValueType.NUMBER, "cm", "Clear width of lift entrance"),
        (FeatureType.LIFT, "braille_buttons", AttrValueType.BOOLEAN, "", "Braille or raised alphanumeric buttons"),
        (FeatureType.LIFT, "audio_announcement", AttrValueType.BOOLEAN, "", "Audible floor arrival announcements"),

        # Toilet
        (FeatureType.TOILET, "grab_rails", AttrValueType.BOOLEAN, "", "Firm grab rails installed adjacent to commode"),
        (FeatureType.TOILET, "door_width_cm", AttrValueType.NUMBER, "cm", "Clear entrance width for wheelchair clearance"),
        (FeatureType.TOILET, "emergency_alarm", AttrValueType.BOOLEAN, "", "Pull-cord or low emergency alarm switch"),

        # Counter
        (FeatureType.COUNTER, "counter_height_cm", AttrValueType.NUMBER, "cm", "Height of service desk or reception counter"),
        (FeatureType.COUNTER, "hearing_loop", AttrValueType.BOOLEAN, "", "Induction loop installed for assistive hearing"),

        # Kerb
        (FeatureType.KERB, "kerb_type", AttrValueType.STRING, "", "Kerb transition type: lowered, flush, or raised"),
        (FeatureType.KERB, "kerb_height_cm", AttrValueType.NUMBER, "cm", "Step height above road surface"),

        # Footpath
        (FeatureType.TACTILE_PATH, "tactile_paving", AttrValueType.BOOLEAN, "", "Directional tactile ground surface indicator"),
        (FeatureType.SIGNAGE, "braille", AttrValueType.BOOLEAN, "", "High contrast or braille signage"),

        # Crossing
        (FeatureType.CROSSING, "audio_signal", AttrValueType.BOOLEAN, "", "Acoustic audible traffic crossing signal"),
        (FeatureType.CROSSING, "tactile_paving", AttrValueType.BOOLEAN, "", "Blister paving warning at roadway transition"),

        # Comm Support
        (FeatureType.COMM_SUPPORT, "sign_language_helpdesk", AttrValueType.BOOLEAN, "", "Staff trained in basic sign language"),
    ]

    for f_type, key, val_type, unit, desc in definitions:
        existing = db.query(AttributeDef).filter(
            AttributeDef.feature_type == f_type,
            AttributeDef.key == key
        ).first()
        if not existing:
            db.add(AttributeDef(
                feature_type=f_type,
                key=key,
                value_type=val_type,
                unit=unit,
                description=desc
            ))
            print(f"  + Added attribute_def '{f_type.value}.{key}'")
    db.commit()


def seed_need_rules(db):
    """Seed accessibility evaluation rules."""
    rules = [
        # Step-free profile
        ("step_free", FeatureType.ENTRANCE, "step_count", RuleOperator.EQ, 0, True),
        ("step_free", FeatureType.ENTRANCE, "door_width_cm", RuleOperator.GTE, 90, True),
        ("step_free", FeatureType.KERB, "kerb_type", RuleOperator.IN, ["lowered", "flush"], True),
        ("step_free", FeatureType.RAMP, "slope_pct", RuleOperator.LTE, 8, True),
        ("step_free", FeatureType.LIFT, "lift_working", RuleOperator.EQ, True, True),

        # Wheelchair profile (includes step-free + facility dimensions)
        ("wheelchair", FeatureType.ENTRANCE, "step_count", RuleOperator.EQ, 0, True),
        ("wheelchair", FeatureType.ENTRANCE, "door_width_cm", RuleOperator.GTE, 90, True),
        ("wheelchair", FeatureType.KERB, "kerb_type", RuleOperator.IN, ["lowered", "flush"], True),
        ("wheelchair", FeatureType.RAMP, "slope_pct", RuleOperator.LTE, 8, True),
        ("wheelchair", FeatureType.LIFT, "lift_working", RuleOperator.EQ, True, True),
        ("wheelchair", FeatureType.TOILET, "grab_rails", RuleOperator.EQ, True, False),
        ("wheelchair", FeatureType.TOILET, "door_width_cm", RuleOperator.GTE, 90, False),
        ("wheelchair", FeatureType.COUNTER, "counter_height_cm", RuleOperator.LTE, 85, False),

        # Low vision / Blind profile
        ("tactile", FeatureType.ENTRANCE, "tactile_paving", RuleOperator.EQ, True, True),
        ("tactile", FeatureType.CROSSING, "tactile_paving", RuleOperator.EQ, True, True),
        ("tactile", FeatureType.TACTILE_PATH, "tactile_paving", RuleOperator.EQ, True, True),
        ("tactile", FeatureType.LIFT, "braille_buttons", RuleOperator.EQ, True, False),

        # Audio / Hearing profile
        ("audio_assisted", FeatureType.CROSSING, "audio_signal", RuleOperator.EQ, True, True),
        ("audio_assisted", FeatureType.LIFT, "audio_announcement", RuleOperator.EQ, True, False),
        ("hearing", FeatureType.COUNTER, "hearing_loop", RuleOperator.EQ, True, False),

        # Low stamina
        ("low_stamina", FeatureType.ENTRANCE, "step_count", RuleOperator.LTE, 2, False),
        ("low_stamina", FeatureType.RAMP, "slope_pct", RuleOperator.LTE, 10, True),
    ]

    for need_code, f_type, attr_key, op, threshold, critical in rules:
        existing = db.query(NeedRule).filter(
            NeedRule.need_code == need_code,
            NeedRule.feature_type == f_type,
            NeedRule.attribute_key == attr_key,
            NeedRule.operator == op
        ).first()
        if not existing:
            db.add(NeedRule(
                need_code=need_code,
                feature_type=f_type,
                attribute_key=attr_key,
                operator=op,
                threshold=threshold,
                critical=critical
            ))
            print(f"  + Added need_rule '{need_code} -> {f_type.value}.{attr_key}'")
    db.commit()


def main():
    print("Seeding base configuration (settings, attribute definitions, and need rules)...")
    db = SessionLocal()
    try:
        seed_settings(db)
        seed_attribute_defs(db)
        seed_need_rules(db)
        print("Base configuration seeded successfully.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
