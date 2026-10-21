import { ScenarioFixture } from "@/domain";
import s1 from "../../fixtures/scenarios/S1.json";
import s2 from "../../fixtures/scenarios/S2.json";
import s3 from "../../fixtures/scenarios/S3.json";
import s4 from "../../fixtures/scenarios/S4.json";
import s5 from "../../fixtures/scenarios/S5.json";
import s6 from "../../fixtures/scenarios/S6.json";

/** The S1–S6 fixtures, bundled into the client so "Load demo day" works offline. */
export const demoFixtures = (): ScenarioFixture[] =>
  [s1, s2, s3, s4, s5, s6].map((f) => ScenarioFixture.parse(f));
