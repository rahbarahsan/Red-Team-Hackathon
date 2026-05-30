import {
  GcdsAlert,
  GcdsDetails,
  GcdsCard,
} from "@gcds-core/components-react";
import type { AnomalyRecord } from "../types";

interface Props {
  anomalies: AnomalyRecord[];
}

// Anomaly severity mapping based on risk to procurement decisions
const anomalySeverity: Record<string, { level: "low" | "medium" | "high" | "critical"; description: string }> = {
  mass_balance_violation: {
    level: "critical",
    description: "Physical impossibility detected - more materials consumed than produced by supplier"
  },
  signature_verification_failed: {
    level: "critical", 
    description: "Cryptographic signature invalid - attestation may be forged or corrupted"
  },
  parent_hash_mismatch: {
    level: "critical",
    description: "Supply chain integrity compromised - parent attestation content does not match reference"
  },
  duplicate_attestation_id: {
    level: "high",
    description: "Duplicate attestation detected - possible replay attack or data corruption"
  },
  cost_outlier: {
    level: "medium",
    description: "Cost significantly outside normal range for this type of operation"
  },
  labour_outlier: {
    level: "medium", 
    description: "Labour hours unusual for reported manufacturing process"
  },
  timing_outlier: {
    level: "medium",
    description: "Timestamp inconsistent with typical supply chain timing patterns"
  },
  supplier_mismatch: {
    level: "high",
    description: "Supplier performing work outside their registered capabilities or jurisdiction"
  },
  currency_inconsistency: {
    level: "low",
    description: "Currency or unit conversion may require verification"
  },
  insufficient_data: {
    level: "medium",
    description: "Missing information prevents complete verification of Canadian content claim"
  }
};

const severityColors: Record<string, string> = {
  low: "#00703C",      // Canada.ca success green
  medium: "#FF8C00",   // Warning orange  
  high: "#D3080C",     // Canada.ca danger red
  critical: "#8B0000", // Dark red
};

function getSeverityInfo(anomalyType: string) {
  // Clean up anomaly type (remove underscores, normalize)
  const cleanType = anomalyType.toLowerCase().replace(/\s+/g, "_");
  return anomalySeverity[cleanType] || {
    level: "medium" as const,
    description: "Anomaly detected that requires review by procurement officer"
  };
}

function getRemediationSteps(anomalyType: string, severity: string): string[] {
  const baseSteps = [
    "Contact supplier for clarification and supporting documentation",
    "Review internal procurement approval processes",
    "Document findings in procurement file"
  ];

  if (severity === "critical") {
    return [
      "STOP: Do not proceed with procurement until resolved",
      "Escalate to senior procurement officer immediately",
      "Request complete re-attestation from supplier with verified signatures",
      ...baseSteps
    ];
  }

  if (severity === "high") {
    return [
      "Suspend procurement pending investigation",
      "Require additional verification from supplier",
      "Consider third-party audit or inspection",
      ...baseSteps
    ];
  }

  if (anomalyType.includes("cost") || anomalyType.includes("labour")) {
    return [
      "Request detailed cost breakdown from supplier",
      "Compare against industry benchmarks",
      "Verify labour compliance certifications",
      ...baseSteps
    ];
  }

  return baseSteps;
}

export default function AnomalyExplainer({ anomalies }: Props) {
  if (anomalies.length === 0) return null;

  // Group anomalies by severity
  const groupedAnomalies = anomalies.reduce((groups, anomaly) => {
    const severity = getSeverityInfo(anomaly.type).level;
    if (!groups[severity]) groups[severity] = [];
    groups[severity].push(anomaly);
    return groups;
  }, {} as Record<string, AnomalyRecord[]>);

  const hasCritical = groupedAnomalies.critical?.length > 0;
  const hasHigh = groupedAnomalies.high?.length > 0;

  return (
    <div className="anomaly-explainer">
      {/* Critical Alert */}
      {hasCritical && (
        <GcdsAlert 
          alertRole="danger"
          heading="Critical integrity violation detected"
        >
          <p>
            <strong>Procurement must be suspended.</strong> Critical anomalies indicate potential fraud, 
            forgery, or systematic data corruption that compromises the integrity of Canadian content claims.
          </p>
          <p>
            Contact the <strong>Senior Procurement Officer</strong> immediately for escalation procedures.
          </p>
        </GcdsAlert>
      )}

      {/* High Risk Alert */}
      {hasHigh && !hasCritical && (
        <GcdsAlert 
          alertRole="warning" 
          heading="High-risk anomalies require investigation"
        >
          <p>
            Significant concerns identified that may impact procurement eligibility. 
            Additional verification required before proceeding.
          </p>
        </GcdsAlert>
      )}

      {/* Detailed Anomaly Breakdown */}
      <GcdsCard cardTitle={`${anomalies.length} anomal${anomalies.length === 1 ? 'y' : 'ies'} detected`}>
        <div className="anomaly-list-detailed">
          {Object.entries(groupedAnomalies)
            .sort(([a], [b]) => {
              const order = { critical: 0, high: 1, medium: 2, low: 3 };
              return order[a as keyof typeof order] - order[b as keyof typeof order];
            })
            .map(([severity, severityAnomalies]) => (
              <div key={severity} className={`severity-group severity-${severity}`}>
                <h4 className="severity-header">
                  <span 
                    className="severity-indicator"
                    style={{ backgroundColor: severityColors[severity] }}
                  />
                  {severity.toUpperCase()} ({severityAnomalies.length})
                </h4>
                
                {severityAnomalies.map((anomaly, index) => {
                  const severityInfo = getSeverityInfo(anomaly.type);
                  const remediationSteps = getRemediationSteps(anomaly.type, severity);
                  
                  return (
                    <div key={`${anomaly.attestation_id}-${index}`} className="anomaly-detail">
                      <div className="anomaly-summary">
                        <h5>{anomaly.type.replace(/_/g, " ").toUpperCase()}</h5>
                        <code className="attestation-ref">{anomaly.attestation_id}</code>
                      </div>
                      
                      <p className="anomaly-description">{severityInfo.description}</p>
                      <p className="anomaly-details"><strong>Details:</strong> {anomaly.details}</p>
                      
                      <GcdsDetails detailsTitle="Remediation steps">
                        <ol className="remediation-steps">
                          {remediationSteps.map((step, stepIndex) => (
                            <li key={stepIndex} className={step.startsWith("STOP") ? "critical-step" : ""}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </GcdsDetails>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>
        
        {/* Legal and Policy References */}
        <GcdsDetails detailsTitle="Legal and policy framework">
          <div className="policy-references">
            <h5>Applicable regulations</h5>
            <ul>
              <li><strong>Policy on Government Security (PGS):</strong> Information integrity requirements</li>
              <li><strong>Canadian Free Trade Agreement (CFTA):</strong> Procurement transparency obligations</li>
              <li><strong>Trade Agreements:</strong> Buy Canadian compliance verification</li>
              <li><strong>Financial Administration Act:</strong> Due diligence in public procurement</li>
            </ul>
            
            <h5>Next steps for procurement officers</h5>
            <ol>
              <li>Document all anomalies in the procurement file</li>
              <li>Assess materiality and risk to the Crown</li>
              <li>Consider alternative suppliers if risks cannot be mitigated</li>
              <li>Escalate to legal services if fraud is suspected</li>
            </ol>
          </div>
        </GcdsDetails>
      </GcdsCard>
    </div>
  );
}