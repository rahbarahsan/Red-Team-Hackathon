import { useEffect, useRef, useState } from "react";
import {
  GcdsButton,
  GcdsContainer,
  GcdsFooter,
  GcdsHeader,
  GcdsInput,
  GcdsNotice,
  GcdsTextarea,
} from "@gcds-core/components-react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import ProvenanceTimeline from "./components/ProvenanceTimeline";
import type { Attestation, ChainRequest, VerifyResult } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const SAMPLE_PRODUCT_ID = "att-anchor-0012";

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

function parseSupplierDraft(text: string) {
  try {
    return JSON.parse(text) as Record<string, any>;
  } catch {
    return JSON.parse(defaultSupplierJson()) as Record<string, any>;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"purchaser" | "supplier">("purchaser");
  const [productId, setProductId] = useState(SAMPLE_PRODUCT_ID);
  const [chainText, setChainText] = useState("");
  const [chain, setChain] = useState<ChainRequest | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [supplierPreview, setSupplierPreview] = useState(defaultSupplierJson());
  const [issuedAttestation, setIssuedAttestation] = useState<Attestation | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    void loadSample();
    return () => {
      void stopScanner();
    };
  }, []);

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Ignore camera cleanup errors so the demo can continue with manual lookup.
    } finally {
      scannerRef.current = null;
      setScannerActive(false);
    }
  }

  async function startScanner() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera scanning is not available in this browser. Use manual product lookup instead.");
      return;
    }
    await stopScanner();
    try {
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      setScannerActive(true);
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopScanner();
          setProductId(decodedText);
          await lookupProduct(decodedText);
        },
        () => undefined
      );
    } catch (exc) {
      await stopScanner();
      setError(
        exc instanceof Error
          ? `Could not start camera scanner: ${exc.message}`
          : "Could not start camera scanner. Use manual lookup instead."
      );
    }
  }

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

  async function lookupProduct(id = productId.trim()) {
    if (!id) {
      setError("Enter a product ID before verifying.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/products/${encodeURIComponent(id)}/chain`);
      if (!response.ok) throw new Error(`No product chain found for ${id}.`);
      const productChain = (await response.json()) as ChainRequest;
      setProductId(productChain.product_attestation_id);
      setChainText(JSON.stringify(productChain, null, 2));
      await verify(productChain);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Product lookup failed.");
    } finally {
      setLoading(false);
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

  async function issueAttestation() {
    setError("");
    try {
      const unsigned = JSON.parse(supplierPreview);
      const response = await fetch(`${API_BASE}/issue-attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation: unsigned }),
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = (await response.json()) as { attestation: Attestation };
      setIssuedAttestation(payload.attestation);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Could not issue signed attestation.");
    }
  }

  function downloadAttestation(att: Attestation) {
    const json = JSON.stringify(att, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${att.attestation_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadQrCode(attId: string) {
    const container = document.getElementById("attestation-qr");
    const canvas = container?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${attId}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  function updateSupplierDraft(updates: Record<string, string | number>) {
    const draft = parseSupplierDraft(supplierPreview);
    let parents = draft.parents;
    if (typeof updates.parents_json === "string") {
      try {
        parents = JSON.parse(updates.parents_json || "[]");
      } catch {
        parents = draft.parents;
      }
    }
    const next = {
      ...draft,
      supplier_id: updates.supplier_id ?? draft.supplier_id,
      action_type: updates.action_type ?? draft.action_type,
      performed_in_country: updates.performed_in_country ?? draft.performed_in_country,
      parents,
      output: {
        ...(draft.output ?? {}),
        name: updates.output_name ?? draft.output?.name,
        quantity_produced: updates.quantity_produced ?? draft.output?.quantity_produced,
        unit: updates.unit ?? draft.output?.unit,
      },
      costs: {
        ...(draft.costs ?? {}),
        material_cad: updates.material_cad ?? draft.costs?.material_cad,
        labour_hours: updates.labour_hours ?? draft.costs?.labour_hours,
        labour_cost_cad: updates.labour_cost_cad ?? draft.costs?.labour_cost_cad,
      },
    };
    setSupplierPreview(JSON.stringify(next, null, 2));
  }

  const decision = result?.chain_valid
    ? result.designation === "none"
      ? "Review claim"
      : "Accept Canadian claim"
    : "Review required";
  const supplierDraft = parseSupplierDraft(supplierPreview);

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
            <div className="impact-strip" aria-label="Service outcomes">
              <span>Verified / Vérifié</span>
              <span>Made in Canada / Fabriqué au Canada</span>
              <span>Procurement-ready audit trail</span>
            </div>
            <div className="tab-row" role="tablist" aria-label="Service mode">
              <GcdsButton
                className={activeTab === "purchaser" ? "tab-button active" : "tab-button"}
                buttonRole={activeTab === "purchaser" ? "primary" : "secondary"}
                onClick={() => setActiveTab("purchaser")}
              >
                Purchaser verification
              </GcdsButton>
              <GcdsButton
                className={activeTab === "supplier" ? "tab-button active" : "tab-button"}
                buttonRole={activeTab === "supplier" ? "primary" : "secondary"}
                onClick={() => setActiveTab("supplier")}
              >
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
                  Scan a product QR code with your camera or enter a product attestation ID manually. The product record is verified by the same backend used by the challenge harness.
                </p>
                <div className="qr-lookup">
                  <div className="qr-card" aria-label={`QR code for product ${SAMPLE_PRODUCT_ID}`}>
                    <QRCodeSVG value={SAMPLE_PRODUCT_ID} size={150} level="M" includeMargin />
                    <p>Product QR code</p>
                    <span>Scan to verify provenance</span>
                  </div>
                  <div className="lookup-form">
                    <GcdsInput
                      inputId="product-id"
                      label="Product attestation ID"
                      value={productId}
                      onGcdsInput={(event: CustomEvent) => setProductId(String(event.detail.value))}
                    />
                    <div className="button-row compact">
                      <GcdsButton onClick={() => lookupProduct()}>{loading ? "Looking up..." : "Verify product"}</GcdsButton>
                      <GcdsButton buttonRole="secondary" onClick={startScanner}>Scan QR with camera</GcdsButton>
                      <GcdsButton buttonRole="secondary" onClick={() => lookupProduct(SAMPLE_PRODUCT_ID)}>Load sample product</GcdsButton>
                    </div>
                    <div className={scannerActive ? "scanner-panel active" : "scanner-panel"}>
                      <div id="qr-reader" aria-label="Camera QR scanner" />
                      {scannerActive && (
                        <GcdsButton buttonRole="secondary" onClick={stopScanner}>Stop scanner</GcdsButton>
                      )}
                    </div>
                  </div>
                </div>
                {result && (
                  <div className="decision-panel">
                    <p className="eyebrow">Procurement decision support</p>
                    <h3>{decision}</h3>
                    <p>
                      {result.chain_valid
                        ? `The chain is cryptographically valid and the current designation is ${result.designation.replace(/_/g, " ")}.`
                        : "One or more anomalies were detected. Procurement officers should review the flagged attestations before accepting the claim."}
                    </p>
                  </div>
                )}
                <GcdsTextarea
                  textareaId="chain-json"
                  label="Attestation chain JSON"
                  rows={18}
                  value={chainText}
                  onGcdsInput={(event: CustomEvent) => setChainText(String(event.detail.value))}
                />
                <div className="button-row">
                  <GcdsButton onClick={() => verify()}>{loading ? "Verifying..." : "Verify chain"}</GcdsButton>
                  <GcdsButton buttonRole="secondary" onClick={loadSample}>Load worked example JSON</GcdsButton>
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
                Issue a real signed attestation using the private keys supplied in the challenge kit. This creates a cryptographic contribution record for downstream buyers.
              </p>

              <div className="supplier-form">
                <fieldset className="form-group">
                  <legend>Supplier information</legend>
                  <div className="form-group-fields">
                    <GcdsInput
                      inputId="supplier-id"
                      label="Supplier ID"
                      value={String(supplierDraft.supplier_id ?? "")}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ supplier_id: String(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="action-type"
                      label="Action type"
                      value={String(supplierDraft.action_type ?? "")}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ action_type: String(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="country"
                      label="Performed in country"
                      value={String(supplierDraft.performed_in_country ?? "")}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ performed_in_country: String(event.detail.value) })}
                    />
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend>Output details</legend>
                  <div className="form-group-fields">
                    <GcdsInput
                      inputId="output-name"
                      label="Output name"
                      value={String(supplierDraft.output?.name ?? "")}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ output_name: String(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="quantity-produced"
                      label="Quantity produced"
                      value={String(supplierDraft.output?.quantity_produced ?? 1)}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ quantity_produced: Number(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="output-unit"
                      label="Output unit"
                      value={String(supplierDraft.output?.unit ?? "units")}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ unit: String(event.detail.value) })}
                    />
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend>Cost breakdown</legend>
                  <div className="form-group-fields">
                    <GcdsInput
                      inputId="material-cost"
                      label="Material cost (CAD)"
                      value={String(supplierDraft.costs?.material_cad ?? 0)}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ material_cad: Number(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="labour-hours"
                      label="Labour hours"
                      value={String(supplierDraft.costs?.labour_hours ?? 0)}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ labour_hours: Number(event.detail.value) })}
                    />
                    <GcdsInput
                      inputId="labour-cost"
                      label="Labour cost (CAD)"
                      value={String(supplierDraft.costs?.labour_cost_cad ?? 0)}
                      onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ labour_cost_cad: Number(event.detail.value) })}
                    />
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend>Parent inputs</legend>
                  <GcdsTextarea
                    textareaId="parents-json"
                    label="Parent attestation references (JSON array)"
                    rows={5}
                    value={JSON.stringify(supplierDraft.parents ?? [], null, 2)}
                    onGcdsInput={(event: CustomEvent) => updateSupplierDraft({ parents_json: String(event.detail.value) })}
                  />
                </fieldset>

                <div className="supplier-callout">
                  <p className="eyebrow">Canadian SME workflow</p>
                  <p>Suppliers record labour, materials, location, and parent inputs, then issue a signed node that travels with the product.</p>
                  <GcdsButton onClick={issueAttestation}>Issue signed attestation</GcdsButton>
                </div>
              </div>

              {issuedAttestation && (
                <div className="issued-card">
                  <GcdsNotice noticeRole="success" noticeTitle="Signed attestation issued" noticeTitleTag="h3">
                    <p className="notice-copy">
                      Your attestation has been signed with Ed25519 and is ready to attach to a product chain.
                    </p>
                  </GcdsNotice>

                  <dl className="issued-fields">
                    <div className="issued-field">
                      <dt>Attestation ID</dt>
                      <dd>
                        <code>{issuedAttestation.attestation_id}</code>
                        <button className="copy-btn" onClick={() => copyToClipboard(issuedAttestation.attestation_id, "id")} title="Copy attestation ID">
                          {copiedField === "id" ? "Copied!" : "Copy"}
                        </button>
                      </dd>
                    </div>
                    <div className="issued-field">
                      <dt>Supplier</dt>
                      <dd>{issuedAttestation.supplier_id}</dd>
                    </div>
                    <div className="issued-field">
                      <dt>Action</dt>
                      <dd>{issuedAttestation.action_type.replace(/_/g, " ")}</dd>
                    </div>
                    <div className="issued-field">
                      <dt>Country</dt>
                      <dd>{issuedAttestation.performed_in_country}</dd>
                    </div>
                    <div className="issued-field">
                      <dt>Timestamp</dt>
                      <dd>{issuedAttestation.timestamp}</dd>
                    </div>
                    <div className="issued-field full-width">
                      <dt>Signature</dt>
                      <dd>
                        <code className="sig-preview">
                          {issuedAttestation.signature.value.slice(0, 12)}…{issuedAttestation.signature.value.slice(-12)}
                        </code>
                        <button className="copy-btn" onClick={() => copyToClipboard(issuedAttestation.signature.value, "sig")} title="Copy full signature">
                          {copiedField === "sig" ? "Copied!" : "Copy"}
                        </button>
                      </dd>
                    </div>
                  </dl>

                  <div className="issued-qr" id="attestation-qr">
                    <p className="eyebrow">Scannable attestation</p>
                    <QRCodeCanvas
                      value={JSON.stringify(issuedAttestation)}
                      size={200}
                      level="M"
                      includeMargin
                    />
                    <p className="qr-caption">Scan to import this signed attestation into a product chain</p>
                  </div>

                  <div className="issued-actions">
                    <GcdsButton onClick={() => downloadAttestation(issuedAttestation)}>
                      Download signed attestation (.json)
                    </GcdsButton>
                    <GcdsButton buttonRole="secondary" onClick={() => downloadQrCode(issuedAttestation.attestation_id)}>
                      Download QR code (.png)
                    </GcdsButton>
                    <GcdsButton buttonRole="secondary" onClick={() => copyToClipboard(JSON.stringify(issuedAttestation, null, 2), "json")}>
                      {copiedField === "json" ? "Copied to clipboard!" : "Copy full JSON"}
                    </GcdsButton>
                  </div>
                </div>
              )}
            </section>
          )}
        </GcdsContainer>
      </main>

      <GcdsFooter display="compact" />
    </>
  );
}
