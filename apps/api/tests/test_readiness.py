from datetime import datetime, timezone, timedelta
import pytest
from app.services.readiness import (
    evaluate_journey,
    JourneyStep,
    NeedRuleDefinition,
    EvidenceRecord,
    StepStatus,
    JourneyVerdictStatus
)


@pytest.fixture
def base_rules():
    return [
        NeedRuleDefinition(need_code="step_free", feature_type="entrance", attribute_key="step_count", operator="eq", threshold=0, critical=True),
        NeedRuleDefinition(need_code="step_free", feature_type="entrance", attribute_key="door_width_cm", operator="gte", threshold=90, critical=True),
        NeedRuleDefinition(need_code="step_free", feature_type="lift", attribute_key="lift_working", operator="eq", threshold=True, critical=True),
        NeedRuleDefinition(need_code="tactile", feature_type="footpath", attribute_key="tactile_paving", operator="eq", threshold=True, critical=True),
        NeedRuleDefinition(need_code="tactile", feature_type="entrance", attribute_key="tactile_paving", operator="eq", threshold=True, critical=True),
    ]


@pytest.fixture
def now_time():
    return datetime(2026, 10, 15, 12, 0, 0, tzinfo=timezone.utc)


def test_unknown_plus_step_free_never_confirmed(base_rules, now_time):
    """Rule 1: If evidence for a needed feature is missing, step is unknown and verdict must be not_confirmed."""
    step = JourneyStep(
        step_id="step-1",
        feature_id="feat-entrance-1",
        feature_type="entrance",
        description="Main Hospital Entrance",
        is_critical=True
    )
    # Zero evidence provided for entrance step_count or door_width_cm
    evidence = {}

    verdict = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)

    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED
    assert verdict.step_results[0].status == StepStatus.UNKNOWN
    assert "not confirmed" in verdict.summary_text.lower()
    assert "accessible" not in verdict.summary_text.lower()
    assert len(verdict.step_results[0].next_actions) > 0


def test_expired_verified_becomes_unknown(base_rules, now_time):
    """Rule 2: Evidence expires. An expired record must count as unknown."""
    step = JourneyStep(
        step_id="step-1",
        feature_id="feat-entrance-1",
        feature_type="entrance",
        description="Main Hospital Entrance",
        is_critical=True
    )

    # Evidence expired 1 day before query time
    expired_evidence = EvidenceRecord(
        evidence_id="ev-1",
        feature_id="feat-entrance-1",
        attribute_key="step_count",
        value=0,
        label="verified",
        source="auditor",
        observed_at=now_time - timedelta(days=91),
        expires_at=now_time - timedelta(days=1),  # EXPIRED
        status="approved"
    )

    evidence = {"feat-entrance-1": [expired_evidence]}

    verdict = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)

    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED
    assert verdict.step_results[0].status == StepStatus.UNKNOWN
    assert "accessible" not in verdict.summary_text.lower()


def test_barrier_beats_unknown(base_rules, now_time):
    """Precedence rule: BARRIER > UNKNOWN > REPORTED > VERIFIED."""
    step = JourneyStep(
        step_id="step-1",
        feature_id="feat-entrance-1",
        feature_type="entrance",
        description="Main Entrance",
        is_critical=True
    )

    # step_count has 3 steps (FAILS rule step_count == 0 => BARRIER)
    # door_width_cm is missing (UNKNOWN)
    ev_step = EvidenceRecord(
        evidence_id="ev-1",
        feature_id="feat-entrance-1",
        attribute_key="step_count",
        value=3,  # Barrier
        label="verified",
        source="auditor",
        observed_at=now_time - timedelta(days=10),
        expires_at=now_time + timedelta(days=80),
        status="approved"
    )

    evidence = {"feat-entrance-1": [ev_step]}

    verdict = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)

    # Barrier must win over Unknown
    assert verdict.step_results[0].status == StepStatus.BARRIER
    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED
    assert "accessible" not in verdict.summary_text.lower()


def test_strictest_rule_wins_with_combined_needs(base_rules, now_time):
    """With multiple needs, the strictest rule wins across attributes."""
    step = JourneyStep(
        step_id="step-1",
        feature_id="feat-entrance-1",
        feature_type="entrance",
        description="Main Entrance",
        is_critical=True
    )

    # Satisfies step_free: step_count=0, door_width_cm=100
    # Fails tactile: tactile_paving missing (UNKNOWN)
    ev_steps = EvidenceRecord(
        evidence_id="ev-1",
        feature_id="feat-entrance-1",
        attribute_key="step_count",
        value=0,
        label="verified",
        source="auditor",
        observed_at=now_time - timedelta(days=5),
        expires_at=now_time + timedelta(days=85),
        status="approved"
    )
    ev_width = EvidenceRecord(
        evidence_id="ev-2",
        feature_id="feat-entrance-1",
        attribute_key="door_width_cm",
        value=100,
        label="verified",
        source="auditor",
        observed_at=now_time - timedelta(days=5),
        expires_at=now_time + timedelta(days=85),
        status="approved"
    )

    evidence = {"feat-entrance-1": [ev_steps, ev_width]}

    # User requires both step_free AND tactile
    verdict = evaluate_journey([step], ["step_free", "tactile"], base_rules, evidence, now_time)

    # Tactile paving is missing -> step status is UNKNOWN (strictest wins)
    assert verdict.step_results[0].status == StepStatus.UNKNOWN
    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED


def test_temporary_barrier_expires_in_7_days(base_rules, now_time):
    """Temporary barrier e.g. lift outage expires in 7 days and reverts to unknown."""
    step = JourneyStep(
        step_id="step-lift",
        feature_id="feat-lift-1",
        feature_type="lift",
        description="Registration Building Lift",
        is_critical=True
    )

    # Temporary lift outage recorded 8 days ago with 7-day expiry
    ev_outage = EvidenceRecord(
        evidence_id="ev-temp-1",
        feature_id="feat-lift-1",
        attribute_key="lift_working",
        value=False,
        label="temporary_barrier",
        source="auditor",
        observed_at=now_time - timedelta(days=8),
        expires_at=now_time - timedelta(days=1),  # Expired after 7 days
        status="approved"
    )

    evidence = {"feat-lift-1": [ev_outage]}

    verdict = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)

    # Because temporary barrier expired, it is no longer an active barrier; it reverts to UNKNOWN
    assert verdict.step_results[0].status == StepStatus.UNKNOWN
    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED


def test_ai_sourced_evidence_cannot_create_verified(base_rules, now_time):
    """Rule 3: AI output can NEVER be verified. Invariant guard in engine."""
    step = JourneyStep(
        step_id="step-1",
        feature_id="feat-entrance-1",
        feature_type="entrance",
        description="Main Entrance",
        is_critical=True
    )

    # Rogue evidence with source='ai' and label='verified'
    ev_ai = EvidenceRecord(
        evidence_id="ev-ai-1",
        feature_id="feat-entrance-1",
        attribute_key="step_count",
        value=0,
        label="verified",
        source="ai",  # AI source claiming verified
        observed_at=now_time - timedelta(days=1),
        expires_at=now_time + timedelta(days=30),
        status="approved"
    )

    evidence = {"feat-entrance-1": [ev_ai]}

    verdict = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)

    # Must be sanitized out and treated as UNKNOWN
    assert verdict.step_results[0].status == StepStatus.UNKNOWN
    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED


def test_all_verified_yields_confirmed_verdict(base_rules, now_time):
    """When all critical steps have valid unexpired verified evidence, journey is confirmed."""
    step1 = JourneyStep("s1", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)
    step2 = JourneyStep("s2", "feat-lift-1", "lift", "Central Lift", is_critical=True)

    evidence = {
        "feat-entrance-1": [
            EvidenceRecord("e1", "feat-entrance-1", "step_count", 0, "verified", "auditor", now_time - timedelta(days=10), now_time + timedelta(days=80)),
            EvidenceRecord("e2", "feat-entrance-1", "door_width_cm", 95, "verified", "auditor", now_time - timedelta(days=10), now_time + timedelta(days=80)),
        ],
        "feat-lift-1": [
            EvidenceRecord("e3", "feat-lift-1", "lift_working", True, "verified", "auditor", now_time - timedelta(days=5), now_time + timedelta(days=85)),
        ]
    }

    verdict = evaluate_journey([step1, step2], ["step_free"], base_rules, evidence, now_time)

    assert verdict.status == JourneyVerdictStatus.CONFIRMED
    assert verdict.confidence_score == 1.0
    assert "confirmed" in verdict.summary_text.lower()


# ---------------------------------------------------------------------------
# Honest handling of steps nothing was assessed for
# ---------------------------------------------------------------------------

def _verified(feature_id, key, value, now_time, days_ago=3):
    return EvidenceRecord(
        f"ev-{feature_id}-{key}", feature_id, key, value, "verified", "auditor",
        now_time - timedelta(days=days_ago), now_time + timedelta(days=60)
    )


def test_step_without_applicable_rule_is_neutral_not_applicable(base_rules, now_time):
    """A feature no requirement applies to is neutral: flagged not applicable, never 'evidence'."""
    entrance = JourneyStep("s1", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)
    signage = JourneyStep("s2", "feat-signage-1", "signage", "Notice board", is_critical=True)
    evidence = {
        "feat-entrance-1": [
            _verified("feat-entrance-1", "step_count", 0, now_time),
            _verified("feat-entrance-1", "door_width_cm", 95, now_time),
        ]
    }

    verdict = evaluate_journey([entrance, signage], ["step_free"], base_rules, evidence, now_time)

    assert verdict.step_results[0].applicable is True
    assert verdict.step_results[1].applicable is False
    assert verdict.step_results[1].label is None and verdict.step_results[1].source is None
    assert verdict.status == JourneyVerdictStatus.CONFIRMED


def test_neutral_steps_do_not_inflate_confidence(base_rules, now_time):
    """Many un-assessed route steps must not make an unknown entrance look 'mostly confirmed'."""
    entrance = JourneyStep("s0", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)
    footpaths = [
        JourneyStep(f"seg-{i}", f"seg-{i}", "unmapped_kind", f"Follow footpath {i}", is_critical=True)
        for i in range(10)
    ]

    verdict = evaluate_journey([entrance] + footpaths, ["step_free"], base_rules, {}, now_time)

    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED
    assert verdict.confidence_score == 0.0


def test_no_applicable_rules_never_confirms(now_time):
    """Needs without any evaluation rules cannot confirm a journey: absence of rules is not evidence."""
    steps = [JourneyStep("s1", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)]

    verdict = evaluate_journey(steps, ["cognitive"], [], {}, now_time)

    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED
    assert verdict.confidence_score == 0.0
    assert "accessible" not in verdict.summary_text.lower()
    assert verdict.step_results[0].applicable is False


# ---------------------------------------------------------------------------
# Own thresholds
# ---------------------------------------------------------------------------

from app.services.readiness import (  # noqa: E402
    CUSTOM_NEED_CODE,
    apply_threshold_overrides,
    describe_requirements,
    thresholds_to_overrides,
)


def test_thresholds_to_overrides_ignores_unsupported_and_invalid_values():
    overrides = thresholds_to_overrides({
        "min_door_width_cm": 80,
        "max_ramp_slope_pct": float("nan"),
        "max_kerb_height_cm": True,
        "full_profile": {"presets": ["wheelchair"]},
        "name": "Asha",
    })

    assert {o.pref_key for o in overrides} == {"min_door_width_cm"}
    assert all(o.threshold == 80.0 for o in overrides)
    assert thresholds_to_overrides(None) == []
    assert thresholds_to_overrides({}) == []


def test_door_width_override_replaces_standard_threshold(base_rules, now_time):
    """A person's own minimum door width replaces the published 90 cm for their needs."""
    step = JourneyStep("s1", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)
    evidence = {
        "feat-entrance-1": [
            _verified("feat-entrance-1", "step_count", 0, now_time),
            _verified("feat-entrance-1", "door_width_cm", 82, now_time),
        ]
    }

    standard = evaluate_journey([step], ["step_free"], base_rules, evidence, now_time)
    assert standard.step_results[0].status == StepStatus.BARRIER  # 82 < 90

    outcome = apply_threshold_overrides(base_rules, ["step_free"], thresholds_to_overrides({"min_door_width_cm": 80}))
    custom = evaluate_journey([step], outcome.needs, outcome.rules, evidence, now_time)

    assert custom.step_results[0].status == StepStatus.VERIFIED
    assert outcome.applied_keys == ["min_door_width_cm"]
    assert outcome.ignored_keys == []

    requirements, unevaluated = describe_requirements(outcome.rules, outcome.needs)
    door = next(r for r in requirements if r["attribute_key"] == "door_width_cm")
    assert door["threshold"] == 80.0 and door["standard_threshold"] == 90 and door["custom"] is True
    assert unevaluated == []


def test_stricter_override_can_turn_a_pass_into_a_barrier(base_rules, now_time):
    step = JourneyStep("s1", "feat-entrance-1", "entrance", "Main Entrance", is_critical=True)
    evidence = {
        "feat-entrance-1": [
            _verified("feat-entrance-1", "step_count", 0, now_time),
            _verified("feat-entrance-1", "door_width_cm", 95, now_time),
        ]
    }
    outcome = apply_threshold_overrides(base_rules, ["step_free"], thresholds_to_overrides({"min_door_width_cm": 100}))

    verdict = evaluate_journey([step], outcome.needs, outcome.rules, evidence, now_time)

    assert verdict.step_results[0].status == StepStatus.BARRIER
    assert verdict.status == JourneyVerdictStatus.NOT_CONFIRMED


def test_adjust_threshold_without_a_matching_rule_is_ignored_not_invented(now_time):
    """Door width only adjusts rules the selected needs activate; it never adds one."""
    rules = [
        NeedRuleDefinition(need_code="tactile", feature_type="entrance", attribute_key="tactile_paving", operator="eq", threshold=True),
    ]

    outcome = apply_threshold_overrides(rules, ["tactile"], thresholds_to_overrides({"min_door_width_cm": 75}))

    assert outcome.rules == rules
    assert outcome.needs == ["tactile"]
    assert outcome.applied_keys == []
    assert outcome.ignored_keys == ["min_door_width_cm"]


def test_kerb_height_threshold_adds_a_custom_requirement(base_rules, now_time):
    """Kerb height has no published rule: setting it adds one, evaluated against evidence."""
    kerb = JourneyStep("s1", "feat-kerb-1", "kerb", "Crossing kerb", is_critical=True)
    outcome = apply_threshold_overrides(base_rules, ["step_free"], thresholds_to_overrides({"max_kerb_height_cm": 2}))

    assert CUSTOM_NEED_CODE in outcome.needs
    assert outcome.applied_keys == ["max_kerb_height_cm"]

    # No kerb height evidence -> unknown, not confirmed
    unknown = evaluate_journey([kerb], outcome.needs, outcome.rules, {}, now_time)
    assert unknown.step_results[0].status == StepStatus.UNKNOWN
    assert unknown.status == JourneyVerdictStatus.NOT_CONFIRMED

    evidence = {"feat-kerb-1": [
        _verified("feat-kerb-1", "kerb_height_cm", 6, now_time),
        _verified("feat-kerb-1", "kerb_type", "lowered", now_time),
    ]}
    too_high = evaluate_journey([kerb], outcome.needs, outcome.rules, evidence, now_time)
    assert too_high.step_results[0].status == StepStatus.BARRIER


def test_describe_requirements_lists_needs_without_rules(base_rules):
    requirements, unevaluated = describe_requirements(base_rules, ["step_free", "cognitive", "step_free"])

    assert unevaluated == ["cognitive"]
    assert {r["need_code"] for r in requirements} == {"step_free"}
    assert all(r["custom"] is False for r in requirements)
