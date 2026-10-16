from datetime import datetime, timedelta, timezone

from app.services.evidence_summary import EvidenceRow, summarize_evidence

NOW = datetime(2026, 10, 15, 12, 0, 0, tzinfo=timezone.utc)


def _row(feature, label, observed_days_ago, expires_in_days):
    return EvidenceRow(
        feature_id=feature,
        label=label,
        observed_at=NOW - timedelta(days=observed_days_ago),
        expires_at=NOW + timedelta(days=expires_in_days),
    )


def test_no_evidence_is_unknown():
    summary = summarize_evidence(3, [], NOW)

    assert summary.state == "unknown"
    assert summary.feature_count == 3
    assert summary.features_with_current_evidence == 0
    assert summary.last_observed_at is None
    assert summary.next_expiry_at is None


def test_verified_evidence_state_and_counts():
    rows = [_row("f1", "verified", 5, 85), _row("f1", "verified", 5, 85), _row("f2", "reported", 2, 28)]

    summary = summarize_evidence(4, rows, NOW)

    assert summary.state == "verified"
    assert summary.verified_count == 2
    assert summary.reported_count == 1
    assert summary.current_observation_count == 3
    assert summary.features_with_current_evidence == 2
    assert summary.last_observed_at == NOW - timedelta(days=2)
    assert summary.next_expiry_at == NOW + timedelta(days=28)


def test_reported_only_is_not_verified():
    summary = summarize_evidence(1, [_row("f1", "reported", 1, 29)], NOW)

    assert summary.state == "reported"
    assert summary.verified_count == 0


def test_known_barrier_outranks_verified():
    rows = [_row("f1", "verified", 5, 85), _row("f2", "temporary_barrier", 1, 6)]

    summary = summarize_evidence(2, rows, NOW)

    assert summary.state == "known_barrier"
    assert summary.barrier_count == 1


def test_expired_evidence_counts_as_unknown_but_is_reported_as_stale():
    rows = [_row("f1", "verified", 100, -10)]

    summary = summarize_evidence(1, rows, NOW)

    assert summary.state == "unknown"
    assert summary.expired_count == 1
    assert summary.current_observation_count == 0
    assert summary.features_with_current_evidence == 0
    # The last observation is still known, so people can see how stale it is.
    assert summary.last_observed_at == NOW - timedelta(days=100)


def test_expired_barrier_no_longer_blocks():
    rows = [_row("f1", "temporary_barrier", 9, -2), _row("f2", "verified", 3, 87)]

    summary = summarize_evidence(2, rows, NOW)

    assert summary.state == "verified"
    assert summary.barrier_count == 0
    assert summary.expired_count == 1


def test_naive_datetimes_are_treated_as_utc():
    row = EvidenceRow("f1", "verified", datetime(2026, 10, 10, 0, 0), datetime(2026, 12, 1, 0, 0))

    summary = summarize_evidence(1, [row], NOW)

    assert summary.state == "verified"
