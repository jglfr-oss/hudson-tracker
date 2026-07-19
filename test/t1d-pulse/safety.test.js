import { test } from "node:test";
import assert from "node:assert/strict";
import { assessSafety, filterUnsafe } from "../../lib/t1d-pulse/safety.js";

test("assessSafety flags dangerous claims", () => {
  assert.equal(assessSafety("You can stop taking insulin with this herb").safe, false);
  assert.equal(assessSafety("A miracle cure for diabetes").safe, false);
  assert.equal(assessSafety("How to reverse your type 1 naturally").safe, false);
  assert.equal(assessSafety("Cinnamon can cure type 1 diabetes").safe, false);
});

test("assessSafety allows legitimate medical news", () => {
  assert.equal(assessSafety("New insulin pump approved by the FDA").safe, true);
  assert.equal(assessSafety("Study shows CGM improves time in range").safe, true);
  assert.equal(assessSafety("Teplizumab delays type 1 onset in trial").safe, true);
});

test("filterUnsafe drops only the unsafe items, not the whole source", () => {
  const items = [
    { title: "Safe headline about CGM", excerpt: "helpful" },
    { title: "Stop insulin and try this instead", excerpt: "" },
    { title: "Another safe research update", excerpt: "islet cells" },
  ];
  const { safe, rejected } = filterUnsafe(items);
  assert.equal(safe.length, 2);
  assert.equal(rejected, 1);
});
