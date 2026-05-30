import {
  GcdsCard,
  GcdsDetails,
  GcdsAlert,
} from "@gcds-core/components-react";
import type { EthicalRisk, ConfidenceScore } from "../types";

interface Props {
  ethicalRisks?: EthicalRisk[];
  confidenceScore?: ConfidenceScore;
  supplierBreakdown: { supplier: string; certifications: string[]; auditStatus: string; transparencyScore: number; concerns: string[] }[];
}

const riskColors: Record<string, string> = {
  low: "#00703C",      // Canada.ca success green
  medium: "#FF8C00",   // Warning orange
  high: "#D3080C",     // Canada.ca danger red
  critical: "#8B0000", // Dark red
};

const riskLabels: Record<string, string> = {
  labor_conditions: "Labour conditions",
  child_labor: "Child labour",
  environmental: "Environmental impact",
  transparency: "Supply chain transparency",
};

export default function EthicalAssessment({ ethicalRisks = [], confidenceScore, supplierBreakdown }: Props) {
  const overallRisk = ethicalRisks.length > 0 
    ? ethicalRisks.reduce((max, risk) => {
        const levels = { low: 1, medium: 2, high: 3, critical: 4 };
        return levels[risk.level] > levels[max] ? risk.level : max;
      }, "low" as EthicalRisk["level"])
    : "low";

  const unverifiedSuppliers = supplierBreakdown.filter(s => 
    s.auditStatus !== "verified" || s.concerns.length > 0
  );

  return (
    <div className="ethical-assessment">
      {/* Confidence Score Panel - Canada.ca Alert pattern */}
      {confidenceScore && (
        <GcdsAlert 
          alertRole={confidenceScore.overall >= 80 ? "success" : confidenceScore.overall >= 60 ? "warning" : "danger"}
          heading={`${confidenceScore.overall}% confidence in Canadian content claim`}
        >
          <div className="confidence-breakdown">
            <dl className="confidence-metrics">
              <div><dt>Cryptographic verification</dt><dd>{confidenceScore.cryptographic}%</dd></div>
              <div><dt>Statistical analysis</dt><dd>{confidenceScore.statistical}%</dd></div>
              <div><dt>Ethical compliance</dt><dd>{confidenceScore.ethical}%</dd></div>
            </dl>
            
            {confidenceScore.reasoning.length > 0 && (
              <GcdsDetails detailsTitle="Assessment reasoning">
                <ul>
                  {confidenceScore.reasoning.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </GcdsDetails>
            )}
          </div>
        </GcdsAlert>
      )}

      {/* Ethical Risk Assessment */}
      {ethicalRisks.length > 0 && (
        <GcdsCard cardTitle="Ethical supply chain assessment">
          <div className="risk-overview">
            <div className="risk-badge" style={{ backgroundColor: riskColors[overallRisk] }}>
              <span className="risk-level">{overallRisk.toUpperCase()} RISK</span>
              <span className="risk-subtitle">Ethical compliance</span>
            </div>
            
            <div className="risk-details">
              <h4>Identified concerns</h4>
              <ul className="risk-list">
                {ethicalRisks.map((risk, index) => (
                  <li key={index} className={`risk-item risk-${risk.level}`}>
                    <div className="risk-header">
                      <strong>{riskLabels[risk.category]}</strong>
                      <span className="confidence-indicator">{(risk.confidence * 100).toFixed(0)}% confidence</span>
                    </div>
                    <p>{risk.details}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </GcdsCard>
      )}

      {/* Supplier Verification Status */}
      {unverifiedSuppliers.length > 0 && (
        <GcdsAlert 
          alertRole="warning"
          heading="Supplier verification status"
        >
          <p>The following suppliers require additional due diligence:</p>
          <ul>
            {unverifiedSuppliers.map((supplier, index) => (
              <li key={index}>
                <strong>{supplier.supplier}</strong>: 
                {supplier.auditStatus !== "verified" && (
                  <span> Audit status: {supplier.auditStatus}</span>
                )}
                {supplier.concerns.length > 0 && (
                  <span> - {supplier.concerns.join(", ")}</span>
                )}
                <span className="transparency-score"> (Transparency: {supplier.transparencyScore}%)</span>
              </li>
            ))}
          </ul>
          <p className="disclosure">
            <small>
              Assessment based on supplier-specific certifications, third-party audits, and transparency reporting.
              Procurement officers should verify compliance with Government of Canada ethical sourcing requirements.
            </small>
          </p>
        </GcdsAlert>
      )}

      {/* Procurement Guidance - Canada.ca pattern */}
      <GcdsDetails detailsTitle="Ethical procurement guidance">
        <div className="guidance-content">
          <h4>Due diligence requirements</h4>
          <ul>
            <li>Verify supplier compliance with International Labour Organization (ILO) standards</li>
            <li>Review child labour monitoring and remediation programs</li>
            <li>Assess environmental impact and sustainability certifications</li>
            <li>Validate supply chain transparency and traceability measures</li>
          </ul>
          
          <h4>Risk mitigation strategies</h4>
          <ul>
            <li>Require third-party ethical audits for high-risk suppliers</li>
            <li>Implement supplier code of conduct agreements</li>
            <li>Establish ongoing monitoring and reporting mechanisms</li>
            <li>Consider alternative suppliers with better compliance records</li>
          </ul>
          
          <p className="legal-notice">
            <strong>Legal requirement:</strong> All federal procurement must comply with the 
            <em> Policy on Ethical Conduct in Procurement</em> and international trade agreements.
          </p>
        </div>
      </GcdsDetails>
    </div>
  );
}