export type CapabilityFlag = boolean | 'review';

export type ProductType = 'saas' | 'web' | 'desktop' | 'hybrid' | 'unknown';

export type InstallerType = 'none' | 'nsis' | 'inno' | 'unknown';

export interface ScanManifestV1 {
  schema: 1;
  product: {
    id: string;
    type: ProductType;
  };
  runtime: {
    web: boolean;
    desktop: boolean;
    electron: boolean;
  };
  capabilities: {
    authentication: CapabilityFlag;
    rbac: CapabilityFlag;
    multitenant: CapabilityFlag;
    superadmin: CapabilityFlag;
    updater: CapabilityFlag;
  };
  qa: {
    playwright: boolean;
  };
  release: {
    installer: InstallerType;
  };
}
