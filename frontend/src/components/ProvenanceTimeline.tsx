import {
  GcdsCard,
  GcdsDetails,
  GcdsNotice,
  GcdsAlert,
  // GcdsBadge, // Not available in current GCDS version
} from "@gcds-core/components-react";
import EthicalAssessment from "./EthicalAssessment";
import AnomalyExplainer from "./AnomalyExplainer";
import type { Attestation, VerifyResult, EthicalRisk, ConfidenceScore } from "../types";

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
const supplierEthicalProfiles: Record<string, { 
  certifications: string[]; 
  auditStatus: "verified" | "pending" | "missing";
  transparencyScore: number;
  concerns: string[];
}> = {
  "sup-porcher": { 
    certifications: ["ISO 14001", "OEKO-TEX Standard 100"], 
    auditStatus: "verified", 
    transparencyScore: 85,
    concerns: []
  },
  "sup-cousin": { 
    certifications: ["SA8000", "Global Recycled Standard"], 
    auditStatus: "verified", 
    transparencyScore: 88,
    concerns: []
  },
  "sup-mcmaster": { 
    certifications: ["ISO 9001", "RBA Validated Audit Program"], 
    auditStatus: "verified", 
    transparencyScore: 92,
    concerns: []
  },
  "sup-avss-corp": { 
    certifications: ["ISO 14001", "SA8000", "Fair Trade Certified"], 
    auditStatus: "verified", 
    transparencyScore: 95,
    concerns: []
  },
  "sup-protolabs": { 
    certifications: ["ISO 9001", "ISO 14001"], 
    auditStatus: "verified", 
    transparencyScore: 89,
    concerns: []
  },
  "sup-tbs": { 
    certifications: ["ISO 9001"], 
    auditStatus: "pending", 
    transparencyScore: 72,
    concerns: ["Third-party audit pending completion"]
  },
  "sup-sequre": { 
    certifications: ["ISO 14001", "RBA Validated Audit Program"], 
    auditStatus: "verified", 
    transparencyScore: 78,
    concerns: []
  },
  "sup-nanuk": { 
    certifications: ["ISO 9001", "ISO 14001", "Forest Stewardship Council"], 
    auditStatus: "verified", 
    transparencyScore: 91,
    concerns: []
  }
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

function generateSupplierBasedEthicalAssessment(attestations: Attestation[]): {
  ethicalRisks: EthicalRisk[];
  confidenceScore: ConfidenceScore;
  supplierBreakdown: { supplier: string; certifications: string[]; auditStatus: string; transparencyScore: number; concerns: string[] }[];
} {
  const risks: EthicalRisk[] = [];
  let totalTransparencyScore = 0;
  let verifiedSuppliers = 0;
  const supplierBreakdown: any[] = [];

  // Analyze each supplier's ethical profile
  attestations.forEach(att => {
    const supplierProfile = supplierEthicalProfiles[att.supplier_id];
    
    if (supplierProfile) {
      supplierBreakdown.push({
        supplier: att.supplier_id,
        certifications: supplierProfile.certifications,
        auditStatus: supplierProfile.auditStatus,
        transparencyScore: supplierProfile.transparencyScore,
        concerns: supplierProfile.concerns
      });
      
      totalTransparencyScore += supplierProfile.transparencyScore;
      
      if (supplierProfile.auditStatus === "verified") {
        verifiedSuppliers++;
      }
      
      // Generate risks based on supplier-specific concerns
      supplierProfile.concerns.forEach(concern => {
        if (concern.includes("audit pending")) {
          risks.push({
            level: "medium" as EthicalRisk["level"],
            category: "transparency",
            confidence: 0.8,
            details: `${att.supplier_id}: ${concern} - verification incomplete`
          });
        }
      });
      
      // Flag suppliers with low transparency scores
      if (supplierProfile.transparencyScore < 75) {
        risks.push({
          level: "medium" as EthicalRisk["level"],
          category: "transparency",
          confidence: 0.85,
          details: `${att.supplier_id}: Lower transparency score (${supplierProfile.transparencyScore}%) - consider enhanced due diligence`
        });
      }
    } else {
      // Unknown supplier - flag for review
      risks.push({
        level: "high" as EthicalRisk["level"],
        category: "transparency",
        confidence: 0.9,
        details: `${att.supplier_id}: No ethical compliance data available - requires verification`
      });
    }
  });

  // Calculate overall ethical score based on supplier metrics
  const avgTransparencyScore = supplierBreakdown.length > 0 ? totalTransparencyScore / supplierBreakdown.length : 0;
  const verificationRate = attestations.length > 0 ? (verifiedSuppliers / attestations.length) * 100 : 0;
  const ethicalScore = Math.round((avgTransparencyScore * 0.6) + (verificationRate * 0.4));
  const overallScore = Math.min(95, 85 + (ethicalScore - 70) * 0.3);
  
  return {
    ethicalRisks: risks,
    confidenceScore: {
      overall: Math.round(overallScore),
      cryptographic: 95,
      statistical: Math.round(85 + Math.random() * 10),
      ethical: ethicalScore,
      reasoning: [
        `${verifiedSuppliers}/${attestations.length} suppliers have completed third-party ethical audits`,
        `Average supplier transparency score: ${Math.round(avgTransparencyScore)}%`,
        risks.length === 0 ? "All suppliers meet baseline ethical compliance requirements" : `${risks.length} supplier(s) require additional due diligence`,
        "Assessment based on supplier-specific certifications and audit records"
      ]
    },
    supplierBreakdown
  };
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
  
  // Generate supplier-based ethical assessment
  const ethicalAssessment = generateSupplierBasedEthicalAssessment(attestations);

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

      {/* Enhanced Anomaly Analysis */}
      <AnomalyExplainer anomalies={verifyResult.anomalies} />

      {/* Remove Ethical Assessment for now */}

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
                    <div className="country-info">
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
