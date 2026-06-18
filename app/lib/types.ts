export interface ReviewEvidence {
  author: string;
  prNumber: number;
  prUrl: string;
  threadUrl: string | null;
}

export interface AuthorshipEvidence {
  builder: string;
  kind: "file" | "crossref";
  file?: string;
  builderPrUrl: string;
  builderPrNumber: number;
  ownerPrUrl: string | null;
}

export interface Person {
  rank: number;
  login: string;
  reach: number;
  reviewLeverage: number;
  authorshipLeverage: number;
  potency: number;
  reviewInfluentialThreads: number;
  reviewTotalThreads: number;
  reviewEvidence: ReviewEvidence[];
  authorshipEvidence: AuthorshipEvidence[];
}

export interface Snapshot {
  meta: {
    repo: string;
    repoUrl: string;
    windowStart: string;
    windowEnd: string;
    generatedAt: string;
    mergedPrsAnalyzed: number;
    peopleWithLeverage: number;
    authorshipCoRanks: boolean;
    authorshipDensity: { peopleWithAuthorship: number; median: number };
  };
  top5: Person[];
  ranked: Person[];
}
