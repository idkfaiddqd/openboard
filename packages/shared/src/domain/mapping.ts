/** Externally authored projection of current DDD responsibilities onto source artifacts. */
export interface DddMappingSource {
  locator: string;
  repository?: string;
  revision?: string;
  description?: string;
}

export interface DddMappingArtifact extends DddMappingSource {
  participation: string;
}

export interface DddMappingEvidence {
  claim: string;
  locator?: string;
  repository?: string;
  revision?: string;
  method?: string;
  limits?: string;
}

export interface DddMappingEntry {
  id: string;
  responsibility: string;
  explanation?: string;
  artifacts: DddMappingArtifact[];
  evidence: DddMappingEvidence[];
  gaps: string[];
}

export interface DddMappingSection {
  id: string;
  title: string;
  entries: DddMappingEntry[];
}

export interface DddMapping {
  scope?: string;
  sources: DddMappingSource[];
  sections: DddMappingSection[];
}
