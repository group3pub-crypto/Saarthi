from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class StepStatus(str, Enum):
    BARRIER = "barrier"
    UNKNOWN = "unknown"
    REPORTED = "reported"
    VERIFIED = "verified"


class JourneyVerdictStatus(str, Enum):
    CONFIRMED = "confirmed"
    NOT_CONFIRMED = "not_confirmed"


@dataclass(frozen=True)
class JourneyStep:
    step_id: str
    feature_id: str
    feature_type: str  # entrance, ramp, lift, toilet, counter, footpath, crossing, kerb, etc.
    description: str
    floor_level: int = 0
    is_critical: bool = True
    destination_name: Optional[str] = None
    destination_phone: Optional[str] = None


@dataclass(frozen=True)
class NeedRuleDefinition:
    need_code: str
    feature_type: str
    attribute_key: str
    operator: str  # 'eq', 'neq', 'lte', 'gte', 'in', 'not_in'
    threshold: Any
    critical: bool = True


@dataclass(frozen=True)
class EvidenceRecord:
    evidence_id: str
    feature_id: str
    attribute_key: str
    value: Any
    label: str  # 'verified', 'reported', 'temporary_barrier', 'barrier'
    source: str  # 'auditor', 'user', 'osm', 'ai', 'import'
    observed_at: datetime
    expires_at: datetime
    status: str = "approved"  # 'approved', 'pending', 'rejected'


@dataclass(frozen=True)
class NextAction:
    action_type: str  # 'call_helpdesk', 'call_ahead_script', 'alternative_entrance', 'request_assistance'
    title: str
    detail: str
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StepEvaluationResult:
    step_id: str
    feature_id: str
    feature_type: str
    status: StepStatus
    label: Optional[str]
    source: Optional[str]
    observed_at: Optional[datetime]
    age_days: Optional[int]
    expires_at: Optional[datetime]
    reason: str
    limits: str
    next_actions: List[NextAction]


@dataclass(frozen=True)
class JourneyVerdict:
    status: JourneyVerdictStatus
    summary_text: str
    confidence_score: float
    evaluated_at: datetime
    active_needs: List[str]
    step_results: List[StepEvaluationResult]
    limits_notice: str


# Precedence order (worst wins): BARRIER > UNKNOWN > REPORTED > VERIFIED
STATUS_PRECEDENCE = {
    StepStatus.BARRIER: 0,
    StepStatus.UNKNOWN: 1,
    StepStatus.REPORTED: 2,
    StepStatus.VERIFIED: 3,
}

DISCLAIMER_NOTICE = (
    "Decision support only. This verdict reflects current recorded observations "
    "and does not constitute legal or building compliance certification."
)


def evaluate_operator(value: Any, operator: str, threshold: Any) -> bool:
    """Evaluate attribute value against a threshold using rule operator."""
    if operator == "eq":
        return value == threshold
    elif operator == "neq":
        return value != threshold
    elif operator == "lte":
        try:
            return float(value) <= float(threshold)
        except (ValueError, TypeError):
            return False
    elif operator == "gte":
        try:
            return float(value) >= float(threshold)
        except (ValueError, TypeError):
            return False
    elif operator == "in":
        if isinstance(threshold, (list, tuple, set)):
            return value in threshold
        return str(value) == str(threshold)
    elif operator == "not_in":
        if isinstance(threshold, (list, tuple, set)):
            return value not in threshold
        return str(value) != str(threshold)
    return False


def build_next_actions_for_unknown(step: JourneyStep, attribute_key: str) -> List[NextAction]:
    """Generate structured fallback actions when a step is unknown."""
    actions = []

    dest = step.destination_name or "destination"
    if step.destination_phone:
        actions.append(NextAction(
            action_type="call_helpdesk",
            title=f"Call {dest} Helpdesk",
            detail=f"Contact facility at {step.destination_phone} to verify {step.feature_type} accessibility before travelling.",
            payload={"phone": step.destination_phone}
        ))

    actions.append(NextAction(
        action_type="call_ahead_script",
        title="Copy Call-Ahead Script",
        detail="Standardized inquiry script to ask facility staff about on-site barriers.",
        payload={
            "script": f"Hello, I am planning a visit to {dest}. I require step-free access at the {step.feature_type}. Could you confirm whether the {attribute_key.replace('_', ' ')} is currently clear and usable?"
        }
    ))

    actions.append(NextAction(
        action_type="request_assistance",
        title="Assistance Request Message",
        detail="Pre-formatted assistance message to send to companions or facility helpline.",
        payload={
            "message": f"I will arrive at {dest} and need on-site assistance at the {step.feature_type} ({step.description})."
        }
    ))

    return actions


def evaluate_journey(
    steps: List[JourneyStep],
    needs: List[str],
    rules: List[NeedRuleDefinition],
    evidence_by_feature: Dict[str, List[EvidenceRecord]],
    now: datetime
) -> JourneyVerdict:
    """Pure, deterministic journey accessibility readiness evaluation engine.

    Zero database or network access inside this function.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    # Filter rules to active needs
    active_rules = [r for r in rules if r.need_code in needs]

    step_results: List[StepEvaluationResult] = []
    critical_steps_count = 0
    critical_steps_confirmed_count = 0

    for step in steps:
        if step.is_critical:
            critical_steps_count += 1

        # Find rules applicable to this step's feature type
        step_rules = [r for r in active_rules if r.feature_type == step.feature_type]

        if not step_rules:
            # No specific rules for this step under active needs -> step is neutral
            step_results.append(StepEvaluationResult(
                step_id=step.step_id,
                feature_id=step.feature_id,
                feature_type=step.feature_type,
                status=StepStatus.VERIFIED,
                label=None,
                source=None,
                observed_at=None,
                age_days=None,
                expires_at=None,
                reason="No active accessibility constraints for this feature type.",
                limits=DISCLAIMER_NOTICE,
                next_actions=[]
            ))
            if step.is_critical:
                critical_steps_confirmed_count += 1
            continue

        # Evaluate every matching rule; worst rule status wins for this step
        worst_status = StepStatus.VERIFIED
        worst_label: Optional[str] = None
        worst_source: Optional[str] = None
        worst_observed_at: Optional[datetime] = None
        worst_expires_at: Optional[datetime] = None
        reasons: List[str] = []
        step_next_actions: List[NextAction] = []

        for rule in step_rules:
            feature_evidence_list = evidence_by_feature.get(step.feature_id, [])
            
            # Find matching approved evidence for this attribute
            matching_evidence = [
                e for e in feature_evidence_list
                if e.attribute_key == rule.attribute_key and e.status == "approved"
            ]

            # Filter unexpired evidence at query time
            unexpired_evidence = []
            for e in matching_evidence:
                e_exp = e.expires_at if e.expires_at.tzinfo else e.expires_at.replace(tzinfo=timezone.utc)
                if now <= e_exp:
                    unexpired_evidence.append(e)

            # Rule 3 database/engine constraint: AI can NEVER verify
            # If an AI record claims verified, force it down to reported or reject
            sanitized_evidence = []
            for e in unexpired_evidence:
                if e.source == "ai" and e.label == "verified":
                    # Invariant violation guard
                    continue
                sanitized_evidence.append(e)

            if not sanitized_evidence:
                # Missing or expired evidence -> UNKNOWN
                rule_status = StepStatus.UNKNOWN
                rule_label = None
                rule_source = None
                rule_observed_at = None
                rule_expires_at = None
                reason = f"No current evidence for {step.feature_type}.{rule.attribute_key} (missing or expired). Status is unknown."
                step_next_actions.extend(build_next_actions_for_unknown(step, rule.attribute_key))
            else:
                # Pick newest unexpired evidence
                sanitized_evidence.sort(key=lambda x: x.observed_at, reverse=True)
                newest = sanitized_evidence[0]
                rule_label = newest.label
                rule_source = newest.source
                rule_observed_at = newest.observed_at
                rule_expires_at = newest.expires_at

                # If evidence label is barrier or temporary_barrier -> immediate barrier
                if newest.label in ("barrier", "temporary_barrier"):
                    rule_status = StepStatus.BARRIER
                    reason = f"Known {newest.label}: {rule.attribute_key} is {newest.value}."
                    step_next_actions.append(NextAction(
                        action_type="alternative_entrance",
                        title="Seek Alternative Entrance",
                        detail=f"This {step.feature_type} has a reported {newest.label}. Inquire about step-free access alternatives."
                    ))
                else:
                    # Evaluate threshold operator
                    passed = evaluate_operator(newest.value, rule.operator, rule.threshold)
                    if passed:
                        if newest.label == "verified":
                            rule_status = StepStatus.VERIFIED
                        else:
                            rule_status = StepStatus.REPORTED
                        reason = f"Passes rule: {rule.attribute_key}={newest.value} meets requirement ({rule.operator} {rule.threshold})."
                    else:
                        rule_status = StepStatus.BARRIER
                        reason = f"Accessibility barrier: {rule.attribute_key}={newest.value} violates requirement ({rule.operator} {rule.threshold})."
                        step_next_actions.append(NextAction(
                            action_type="alternative_entrance",
                            title="Avoid Barrier Step",
                            detail=f"{step.feature_type} does not satisfy accessibility requirements for {rule.need_code}."
                        ))

            reasons.append(reason)

            # Update worst status according to precedence
            if STATUS_PRECEDENCE[rule_status] < STATUS_PRECEDENCE[worst_status]:
                worst_status = rule_status
                worst_label = rule_label
                worst_source = rule_source
                worst_observed_at = rule_observed_at
                worst_expires_at = rule_expires_at

        # Calculate evidence age in days
        age_days = None
        if worst_observed_at:
            obs = worst_observed_at if worst_observed_at.tzinfo else worst_observed_at.replace(tzinfo=timezone.utc)
            age_days = max(0, (now - obs).days)

        if step.is_critical and worst_status in (StepStatus.VERIFIED, StepStatus.REPORTED):
            critical_steps_confirmed_count += 1

        step_results.append(StepEvaluationResult(
            step_id=step.step_id,
            feature_id=step.feature_id,
            feature_type=step.feature_type,
            status=worst_status,
            label=worst_label,
            source=worst_source,
            observed_at=worst_observed_at,
            age_days=age_days,
            expires_at=worst_expires_at,
            reason="; ".join(reasons),
            limits=DISCLAIMER_NOTICE,
            next_actions=step_next_actions
        ))

    # Overall journey verdict calculation
    # A journey is confirmed ONLY if every critical step has verified or reported status
    has_critical_failure = any(
        res.status in (StepStatus.BARRIER, StepStatus.UNKNOWN)
        for res, step in zip(step_results, steps)
        if step.is_critical
    )

    if len(steps) == 0:
        confidence = 0.0
        overall_status = JourneyVerdictStatus.NOT_CONFIRMED
        summary_text = "No route steps or accessibility evidence recorded. Status: Not confirmed."
    elif critical_steps_count == 0:
        confidence = 1.0
        overall_status = JourneyVerdictStatus.CONFIRMED
        summary_text = "Journey has no critical barriers under the selected profile."
    else:
        confidence = round(critical_steps_confirmed_count / critical_steps_count, 2)
        if has_critical_failure:
            overall_status = JourneyVerdictStatus.NOT_CONFIRMED
            # ABSOLUTE RULE: Never return any text that says "accessible" when overall is not_confirmed
            barrier_count = sum(1 for res, step in zip(step_results, steps) if step.is_critical and res.status == StepStatus.BARRIER)
            unknown_count = sum(1 for res, step in zip(step_results, steps) if step.is_critical and res.status == StepStatus.UNKNOWN)
            
            if barrier_count > 0:
                summary_text = f"Journey NOT CONFIRMED: {barrier_count} known barrier(s) detected along the route."
            else:
                summary_text = f"Journey NOT CONFIRMED: {unknown_count} critical step(s) lack current verified evidence."
        else:
            overall_status = JourneyVerdictStatus.CONFIRMED
            summary_text = "All critical steps confirmed based on current verified and reported evidence."

    return JourneyVerdict(
        status=overall_status,
        summary_text=summary_text,
        confidence_score=confidence,
        evaluated_at=now,
        active_needs=needs,
        step_results=step_results,
        limits_notice=DISCLAIMER_NOTICE
    )
