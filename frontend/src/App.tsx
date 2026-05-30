import { useEffect, useState } from "react";
import {
  GcdsButton,
  GcdsContainer,
  GcdsFooter,
  GcdsHeader,
  GcdsInput,
  GcdsNotice,
  GcdsTextarea,
} from "@gcds-core/components-react";
import ProvenanceTimeline from "./components/ProvenanceTimeline";
import type { ChainRequest, VerifyResult } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function defaultSupplierJson(): string {
  return JSON.stringify(
    {
      version: "1.0",
      supplier_id: "sup-avss-corp",
      timestamp: new Date().toISOString().replace(".000Z", "Z"),
      action_type: "component_manufacture",
      performed_in_country: "CA",
      parents: [],
      output: { name: "Canadian-made component", quantity_produced: 1, unit: "units" },
      costs: { material_cad: 0, labour_hours: 5, labour_cost_cad: 450 },
    },
    null,
    2
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"purchaser" | "supplier">("purchaser");
  const [chainText, setChainText] = useState("");
  const [chain, setChain] = useState<ChainRequest | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [supplierPreview, setSupplierPreview] = useState(defaultSupplierJson());

  useEffect(() => {
    void loadSample();
  }, []);

  async function loadSample() {
    setError("");
    try {
      const response = await fetch(`${API_BASE}/sample-chain`);
      if (!response.ok) throw new Error("Could not load the worked example chain.");
      const sample = (await response.json()) as ChainRequest;
      setChain(sample);
      setChainText(JSON.stringify(sample, null, 2));
      await verify(sample);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not load the sample chain.");
    }
  }

  async function verify(nextChain?: ChainRequest) {
    setLoading(true);
    setError("");
    try {
      const body = nextChain ?? (JSON.parse(chainText) as ChainRequest);
      const response = await fetch(`${API_BASE}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(await response.text());
      setChain(body);
      setResult((await response.json()) as VerifyResult);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <GcdsHeader langHref="#" skipToHref="#main-content">
        <div slot="banner" className="service-banner">
          Canadian Supply Chain Provenance Verification
        </div>
      </GcdsHeader>

      <main id="main-content">
        <section className="hero">
          <GcdsContainer size="xl">
            <p className="eyebrow">Cryptographic provenance service</p>
            <h1>Verify Canadian content claims before procurement decisions are made</h1>
            <p className="hero-copy">
              Check signed supplier attestations, detect tampering and replay, and calculate Product of Canada or Made in Canada designations from the submitted chain.
            </p>
            <div className="tab-row" role="tablist" aria-label="Demo mode">
              <GcdsButton buttonRole={activeTab === "purchaser" ? "primary" : "secondary"} onClick={() => setActiveTab("purchaser")}>
                Purchaser verification
              </GcdsButton>
              <GcdsButton buttonRole={activeTab === "supplier" ? "primary" : "secondary"} onClick={() => setActiveTab("supplier")}>
                Supplier attestation
              </GcdsButton>
            </div>
          </GcdsContainer>
        </section>

        <GcdsContainer size="xl">
          {error && (
            <GcdsNotice noticeRole="danger" noticeTitle="Something needs attention" noticeTitleTag="h2">
              <p className="notice-copy">{error}</p>
            </GcdsNotice>
          )}

          {activeTab === "purchaser" ? (
            <div className="workspace">
              <section className="input-panel" aria-labelledby="verify-heading">
                <h2 id="verify-heading">Purchaser lookup</h2>
                <p>
                  Load the recovery drone worked example or paste any challenge chain JSON. The backend verifies the exact payload submitted to the harness.
                </p>
                <GcdsTextarea
                  textareaId="chain-json"
                  label="Attestation chain JSON"
                  rows={18}
                  value={chainText}
                  onGcdsInput={(event: CustomEvent) => setChainText(String(event.detail.value))}
                />
                <div className="button-row">
                  <GcdsButton onClick={() => verify()}>{loading ? "Verifying..." : "Verify chain"}</GcdsButton>
                  <GcdsButton buttonRole="secondary" onClick={loadSample}>Load worked example</GcdsButton>
                </div>
              </section>

              <section className="result-panel" aria-live="polite">
                {result && chain ? (
                  <ProvenanceTimeline verifyResult={result} attestations={chain.attestations} />
                ) : (
                  <GcdsNotice noticeRole="info" noticeTitle="No verification result yet" noticeTitleTag="h2">
                    <p className="notice-copy">Submit a chain to see the Canadian content calculation and provenance timeline.</p>
                  </GcdsNotice>
                )}
              </section>
            </div>
          ) : (
            <section className="supplier-panel" aria-labelledby="supplier-heading">
              <h2 id="supplier-heading">Supplier attestation workspace</h2>
              <p>
                This demo workspace shows the data a supplier issues before signing. In production, the private key operation would be isolated and audited.
              </p>
              <div className="supplier-grid">
                <div>
                  <GcdsInput inputId="supplier-id" label="Supplier ID" value="sup-avss-corp" />
                  <GcdsInput inputId="country" label="Performed in country" value="CA" />
                  <GcdsInput inputId="output-name" label="Output name" value="Canadian-made component" />
                </div>
                <GcdsTextarea
                  textareaId="supplier-json"
                  label="Unsigned attestation preview"
                  rows={16}
                  value={supplierPreview}
                  onGcdsInput={(event: CustomEvent) => setSupplierPreview(String(event.detail.value))}
                />
              </div>
              <GcdsNotice noticeRole="info" noticeTitle="Demo note" noticeTitleTag="h3">
                <p className="notice-copy">
                  The challenge auto-grades verification, not attestation issuance. This screen is included so judges can see how suppliers would create structured, signable records.
                </p>
              </GcdsNotice>
            </section>
          )}
        </GcdsContainer>
      </main>

      <GcdsFooter display="compact" />
    </>
  );
}
