import {
  GcdsCard,
  GcdsDetails,
  GcdsNotice,
} from "@gcds-core/components-react";
import type { Attestation, VerifyResult } from "../types";

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
        <div>
          <p className="eyebrow">Canadian content</p>
          <p className="percentage">{verifyResult.canadian_content_percentage.toFixed(1)}%</p>
          <p className="designation">{designationLabel(verifyResult.designation)}</p>
        </div>
        <div className="gauge" aria-hidden="true">
          <div style={{ width: `${Math.max(0, Math.min(100, verifyResult.canadian_content_percentage))}%` }} />
          <span className="threshold made">51%</span>
          <span className="threshold product">98%</span>
        </div>
        <dl className="summary-list">
          <div><dt>Attestations</dt><dd>{attestations.length}</dd></div>
          <div><dt>Total direct cost</dt><dd>{money(total)}</dd></div>
          <div><dt>Product attestation</dt><dd><code>{verifyResult.product_attestation_id}</code></dd></div>
        </dl>
      </div>

      {verifyResult.anomalies.length > 0 && (
        <GcdsCard cardTitle="Anomalies detected">
          <ul className="anomaly-list">
            {verifyResult.anomalies.map((anomaly, index) => (
              <li key={`${anomaly.attestation_id}-${anomaly.type}-${index}`}>
                <strong>{anomaly.type.replace(/_/g, " ")}</strong>
                <code>{anomaly.attestation_id}</code>
                <span>{anomaly.details}</span>
              </li>
            ))}
          </ul>
        </GcdsCard>
      )}

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
            return (
              <li key={att.attestation_id} className={anomalies.length ? "has-anomaly" : isCanadian ? "is-canadian" : ""}>
                <div className="timeline-marker" aria-hidden="true">{index + 1}</div>
                <div className="timeline-card">
                  <div className="timeline-header">
                    <div>
                      <h3>{att.output.name}</h3>
                      <p>{actionLabels[att.action_type]} by {att.supplier_id}</p>
                    </div>
                    <span className={isCanadian ? "country canadian" : "country"}>
                      {countryNames[att.performed_in_country] ?? att.performed_in_country}
                    </span>
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
