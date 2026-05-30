export interface Costs {
  material_cad: number;
  labour_hours: number;
  labour_cost_cad: number;
}

export interface ParentRef {
  attestation_id: string;
  content_hash: string;
  quantity_consumed: number;
  unit: string;
}

export interface Attestation {
  attestation_id: string;
  version: string;
  supplier_id: string;
  timestamp: string;
  action_type: "raw_material_supply" | "component_manufacture" | "subassembly" | "final_integration";
  performed_in_country: string;
  parents: ParentRef[];
  output: {
    name: string;
    quantity_produced: number;
    unit: string;
  };
  costs: Costs;
  signature: {
    algorithm: string;
    value: string;
  };
}

export interface ChainRequest {
  product_attestation_id: string;
  attestations: Attestation[];
}

export interface AnomalyRecord {
  type: string;
  attestation_id: string;
  details: string;
}

export interface VerifyResult {
  product_attestation_id: string;
  canadian_content_percentage: number;
  designation: "product_of_canada" | "made_in_canada" | "none";
  chain_valid: boolean;
  anomalies: AnomalyRecord[];
}
