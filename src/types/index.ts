export interface NFT {
  id: string;
  tokenId?: string;
  name: string;
  description: string;
  priceEth: string;
  edition?: string;
  originalPriceEth?: string;
  availableQuantity: number;
  version?: number;
  editions?: Array<{
    id: string;
    label: string;
    priceEth: string;
    availableQuantity: number;
  }>;
  imageUrl: string;
  collection: string;
  collectionName?: string;
  network?: string;
  attributes?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
