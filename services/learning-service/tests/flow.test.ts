/**
 * NOTE:
 * 1. In src/index.ts export the express instance:
 *      export const app = express();
 * 2. This test mocks the four client helpers so no real HTTP/gRPC happens.
 */
import './jest.d.ts'; // Import Jest global type declarations
import request from "supertest";
import { app } from "../src/index";
import * as voiceScore from "../src/clients/voiceScore";
import * as grammar from "../src/clients/grammar";
import * as profile from "../src/clients/profile";
import * as reward from "../src/clients/reward";

// --- mocks ------------------------------------------------
jest.mock("../src/clients/voiceScore", () => ({
  evaluate: jest.fn().mockResolvedValue({ score: 0.9 }),
}));

jest.mock("../src/clients/grammar", () => ({
  evaluate: jest.fn().mockResolvedValue({ score: 0.9, corrected: "ok" }),
}));

jest.mock("../src/clients/profile", () => ({
  addXp: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/clients/reward", () => ({
  triggerReward: jest.fn().mockResolvedValue({ success: true, transactionHash: "0xabc" }),
}));

const JWT = "Bearer dummy.jwt.token"; // skip real signing for unit test

describe("Learning flow", () => {
  it("returns vocab list then completes lesson", async () => {
    // 1️⃣ fetch daily vocab
    const daily = await request(app)
      .get("/daily")
      .set("Authorization", JWT)
      .expect(200);

    expect(daily.body).toHaveLength(5);
    const firstWord = daily.body[0];

    // 2️⃣ submit completion with mocked audio + word id
    const result = await request(app)
      .post("/daily/complete")
      .set("Authorization", JWT)
      .send({
        wallet: "sei1learner",
        expectedId: firstWord.id,
        audio: Buffer.from("dummy").toString("base64"),
      })
      .expect(200);

    expect(result.body.pass).toBe(true);
    expect(result.body.pronunciationScore).toBeGreaterThanOrEqual(0.8);
    expect(result.body.grammarScore).toBeGreaterThanOrEqual(0.8);
  });
});
