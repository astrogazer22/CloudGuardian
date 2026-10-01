import { AssetType, AwsAccount } from '@prisma/client';

export interface CollectedAsset {
  type: AssetType;
  arn: string;
  resourceId: string;
  name: string;
  region: string;
  state: string;
  attributes: Record<string, unknown>;
  tags: Record<string, string>;
  /** Outgoing relations by target ARN, e.g. LB -ROUTES_TO-> target group, TG -TARGETS-> instance. */
  relations: { toArn: string; type: 'ROUTES_TO' | 'TARGETS' }[];
}

export interface InventoryCollector {
  collect(account: AwsAccount): Promise<CollectedAsset[]>;
}
