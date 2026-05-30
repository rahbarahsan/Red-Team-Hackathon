import {
  GcdsCard,
  GcdsDetails,
  GcdsNotice,
  GcdsAlert,
  // GcdsBadge, // Not available in current GCDS version
} from "@gcds-core/components-react";
import type { Attestation, VerifyResult, AttestationStatus } from "../types";

interface Props {
  verifyResult: VerifyResult;
  attestations: Attestation[];
}

const actionLabels: Record<string, string> = {
  raw_material_supply: "Raw material supply",
  component_manufacture: "Component manufacture",
  subassembly: "Subassembly",
  final_integration: "Final integration",
};

const countryNames: Record<string, string> = {
  CA: "Canada",
  US: "United States",
  FR: "France",
  CN: "China",
  HK: "Hong Kong",
  VN: "Vietnam",
  DE: "Germany",
  JP: "Japan",
  GB: "United Kingdom",
};

// Supplier-specific ethical certifications and audit data
function money(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function totalCost(att: Attestation): number {
  return att.costs.material_cad + att.costs.labour_cost_cad;
}

function chainTotal(attestations: Attestation[]): number {
  return attestations.reduce((sum, att) => sum + totalCost(att), 0);
}

function orderLeafToRoots(attestations: Attestation[], leafId: string): Attestation[] {
  const byId = new Map(attestations.map((att) => [att.attestation_id, att]));
  const out: Attestation[] = [];
  const seen = new Set<string>();
  const queue = [leafId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const att = byId.get(id);
    if (!att) continue;
    out.push(att);
    for (const parent of att.parents) queue.push(parent.attestation_id);
  }
  for (const att of attestations) {
    if (!seen.has(att.attestation_id)) out.push(att);
  }
  return out;
}

function designationLabel(designation: VerifyResult["designation"]): string {
  if (designation === "product_of_canada") return "Product of Canada";
  if (designation === "made_in_canada") return "Made in Canada";
  return "No Canadian designation";
}

export default function ProvenanceTimeline({ verifyResult, attestations }: Props) {
  const total = chainTotal(attestations);
  const ordered = orderLeafToRoots(attestations, verifyResult.product_attestation_id);
  const anomaliesById = new Map<string, string[]>();
  for (const anomaly of verifyResult.anomalies) {
    const current = anomaliesById.get(anomaly.attestation_id) ?? [];
    current.push(anomaly.type.replace(/_/g, " "));
    anomaliesById.set(anomaly.attestation_id, current);
  }

  // Build verification status map from backend data
  const statusById = new Map<string, AttestationStatus>();
  for (const status of verifyResult.attestation_statuses ?? []) {
    statusById.set(status.attestation_id, status);
  }

  // Compute verified vs unverified within Canadian-performed attestations only
  const canadianAtts = attestations.filter((a) => a.performed_in_country === "CA");
  const canadianTotal = canadianAtts.reduce((sum, a) => sum + a.costs.material_cad + a.costs.labour_cost_cad, 0);
  const canadianVerifiedCost = canadianAtts
    .filter((a) => {
      const status = statusById.get(a.attestation_id);
      return status ? status.verified : !anomaliesById.has(a.attestation_id);
    })
    .reduce((sum, a) => sum + a.costs.material_cad + a.costs.labour_cost_cad, 0);
  const verifiedCostShare = canadianTotal > 0 ? (canadianVerifiedCost / canadianTotal) * 100 : 100;
  const unverifiedCostShare = 100 - verifiedCostShare;
  const verifiedCount = (verifyResult.attestation_statuses ?? []).filter((s) => s.verified).length;
  const unverifiedCount = attestations.length - verifiedCount;

  return (
    <section className="results-grid" aria-label="Verification result">
      <GcdsNotice
        noticeRole={verifyResult.chain_valid ? "success" : "danger"}
        noticeTitle={verifyResult.chain_valid ? "Provenance verified" : "Integrity concerns detected"}
        noticeTitleTag="h2"
      >
        <p className="notice-copy">
          {verifyResult.chain_valid
            ? "The submitted attestations verified cryptographically and passed the integrity checks."
            : `${verifyResult.anomalies.length} anomaly record${verifyResult.anomalies.length === 1 ? "" : "s"} require review before this claim can be trusted.`}
        </p>
      </GcdsNotice>

      <div className="metric-panel" aria-label="Canadian content summary">
        <div className="metric-main">
          <div>
            <p className="eyebrow">Canadian content</p>
            <p className={`percentage ${verifiedCostShare >= 99.5 ? "pct-green" : "pct-warning"}`}>
              {verifyResult.canadian_content_percentage.toFixed(1)}%
            </p>
            <p className="designation">
              {verifyResult.canadian_content_percentage >= 98
                ? "Product of Canada"
                : verifyResult.canadian_content_percentage >= 51
                ? "Made in Canada"
                : "Not Made in Canada"}
            </p>
          </div>
          <div className="metric-actions">
            <GcdsDetails detailsTitle="View verification breakdown">
              <div className="gauge-section">
                <div className="gauge-labels">
                  <span className="gauge-label verified-label">Verified ({verifiedCostShare.toFixed(0)}%)</span>
                  {unverifiedCostShare > 0.5 && (
                    <span className="gauge-label unverified-label">Unverified ({unverifiedCostShare.toFixed(0)}%)</span>
                  )}
                </div>
                <div className="gauge-bar" aria-label={`${verifiedCostShare.toFixed(0)}% verified, ${unverifiedCostShare.toFixed(0)}% unverified by cost share`}>
                  <div className="gauge-verified" style={{ width: `${Math.max(0, Math.min(100, verifiedCostShare))}%` }} />
                  {unverifiedCostShare > 0.5 && (
                    <div className="gauge-unverified" style={{ width: `${Math.max(0, Math.min(100, unverifiedCostShare))}%` }} />
                  )}
                </div>
                <div className="gauge-legend">
                  <span className="legend-item"><span className="legend-swatch verified" /> Verified</span>
                  <span className="legend-item"><span className="legend-swatch unverified" /> Unverified</span>
                </div>
              </div>
            </GcdsDetails>
          </div>
        </div>

        <dl className="summary-list">
          <div><dt>Attestations</dt><dd>{verifiedCount}/{attestations.length} verified</dd></div>
          <div><dt>Total direct cost</dt><dd>{money(total)}</dd></div>
          <div><dt>Product attestation</dt><dd><code>{verifyResult.product_attestation_id}</code></dd></div>
        </dl>
      </div>

      <div className="timeline-block">
        <h2>Supply chain record</h2>
        <p>
          Ordered from the finished product back to its source attestations. Canadian content is assigned by where each step was performed.
        </p>
        <ol className="timeline">
          {ordered.map((att, index) => {
            const cost = totalCost(att);
            const isCanadian = att.performed_in_country === "CA";
            const anomalies = anomaliesById.get(att.attestation_id) ?? [];
            const status = statusById.get(att.attestation_id);
            const isVerified = status ? status.verified : anomalies.length === 0;
            const liClass = isVerified ? "is-verified" : "is-unverified";
            return (
              <li key={att.attestation_id} className={liClass}>
                <div className="timeline-marker" aria-hidden="true">{index + 1}</div>
                <div className="timeline-card">
                  <div className="timeline-header">
                    <div>
                      <h3>{att.output.name}</h3>
                      <p>{actionLabels[att.action_type]} by {att.supplier_id}</p>
                    </div>
                    <div className="country-info">
                      <span className={isVerified ? "status-badge verified" : "status-badge unverified"}>
                        {isVerified ? "✓ Verified" : "✗ Unverified"}
                      </span>
                      <span className={isCanadian ? "country canadian" : "country"}>
                        {countryNames[att.performed_in_country] ?? att.performed_in_country}
                      </span>
                    </div>
                  </div>
                  <dl className="attestation-facts">
                    <div><dt>Material</dt><dd>{money(att.costs.material_cad)}</dd></div>
                    <div><dt>Labour</dt><dd>{money(att.costs.labour_cost_cad)} ({att.costs.labour_hours} h)</dd></div>
                    <div><dt>Output</dt><dd>{att.output.quantity_produced} {att.output.unit}</dd></div>
                    <div><dt>Cost share</dt><dd>{total > 0 ? `${((cost / total) * 100).toFixed(1)}%` : "0%"}</dd></div>
                  </dl>
                  {anomalies.length > 0 && <p className="anomaly-chip">Review: {anomalies.join(", ")}</p>}
                  <GcdsDetails detailsTitle="Technical attestation details">
                    <dl className="technical-list">
                      <div><dt>Attestation ID</dt><dd><code>{att.attestation_id}</code></dd></div>
                      <div><dt>Timestamp</dt><dd>{att.timestamp}</dd></div>
                      <div><dt>Signature</dt><dd><code>{att.signature.algorithm}</code></dd></div>
                      <div><dt>Parents</dt><dd>{att.parents.length || "None"}</dd></div>
                    </dl>
                  </GcdsDetails>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
