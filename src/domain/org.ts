import { z } from "zod";
import { AreaId, AssetId, PersonId, SiteId } from "./common";

export const Area = z.strictObject({
  id: AreaId,
  name: z.string(),
  /** Alternate spellings and spoken forms used by the gazetteer. */
  aliases: z.array(z.string()).default([]),
});

export const Site = z.strictObject({
  id: SiteId,
  name: z.string(),
  aliases: z.array(z.string()).default([]),
  areas: z.array(Area),
});

export const AssetType = z.enum(["forklift", "fire_extinguisher", "valve", "ice_machine"]);

export const Asset = z.strictObject({
  id: AssetId,
  type: AssetType,
  name: z.string(),
  siteId: SiteId,
  areaId: AreaId,
  /** Position within the area, e.g. "Warehouse aisle 2". */
  location: z.string().optional(),
  aliases: z.array(z.string()).default([]),
});

export const Role = z.strictObject({
  id: z.string().regex(/^[a-z_]+$/),
  name: z.string(),
});

export const Person = z.strictObject({
  id: PersonId,
  name: z.string(),
  title: z.string(),
  roles: z.array(z.string()),
  siteId: SiteId.optional(),
  homeAreaId: AreaId.optional(),
  contractorId: z.string().optional(),
  aliases: z.array(z.string()).default([]),
});

export const Contractor = z.strictObject({
  id: z.string().regex(/^CTR-\d{2}$/),
  name: z.string(),
  aliases: z.array(z.string()).default([]),
});

export const Organization = z.strictObject({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  /** UTC offset used for seeded timestamps during the demo period. */
  utcOffset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
  sites: z.array(Site),
  assets: z.array(Asset),
  roles: z.array(Role),
  people: z.array(Person),
  contractors: z.array(Contractor),
});

export type Area = z.infer<typeof Area>;
export type Site = z.infer<typeof Site>;
export type AssetType = z.infer<typeof AssetType>;
export type Asset = z.infer<typeof Asset>;
export type Role = z.infer<typeof Role>;
export type Person = z.infer<typeof Person>;
export type Contractor = z.infer<typeof Contractor>;
export type Organization = z.infer<typeof Organization>;
