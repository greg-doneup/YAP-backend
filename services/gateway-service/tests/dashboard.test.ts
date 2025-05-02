import request from "supertest";
import { app } from "../src/index";

jest.mock("../src/clients/internal", () => ({
  internal: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes("offchain-profile")) return { data: { xp: 100, streak: 2 } };
      if (url.includes("reward-service"))  return { data: { balance: "42" } };
    })
  }
}));

const JWT = "Bearer dummy.jwt.token"; // sign if you want

it("returns aggregated dashboard", async () => {
  const res = await request(app).get("/dashboard").set("Authorization", JWT);
  expect(res.body.xp).toBe(100);
  expect(res.body.yapBalance).toBe("42");
});
it("returns 401 if no JWT", async () => {
  const res = await request(app).get("/dashboard");
  expect(res.status).toBe(401);
});
it("returns 401 if invalid JWT", async () => {
  const res = await request(app).get("/dashboard").set("