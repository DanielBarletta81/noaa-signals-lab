import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSignalParams } from "../src/validation/signalParams.js";
import { ValidationError } from "../src/errors.js";

function fieldsRejected(query) {
  try {
    parseSignalParams(query);
  } catch (error) {
    assert.ok(error instanceof ValidationError, "expected ValidationError");
    assert.equal(error.status, 400);
    assert.equal(error.code, "invalid_parameter");
    return error.details.errors.map((e) => e.field);
  }
  assert.fail(`expected rejection for ${JSON.stringify(query)}`);
}

describe("parseSignalParams: defaults and accepted values", () => {
  it("applies the documented defaults when no parameters are given", () => {
    assert.deepEqual(parseSignalParams({}), {
      station: "8454000",
      product: "water_temperature",
      range: 24,
    });
  });

  it("accepts the allowlisted station and product", () => {
    assert.deepEqual(
      parseSignalParams({ station: "8454000", product: "water_temperature", range: "24" }),
      { station: "8454000", product: "water_temperature", range: 24 }
    );
  });

  it("accepts the lower and upper range bounds", () => {
    assert.equal(parseSignalParams({ range: "1" }).range, 1);
    assert.equal(parseSignalParams({ range: "72" }).range, 72);
  });
});

describe("parseSignalParams: invalid inputs", () => {
  it("rejects a station that is not on the allowlist", () => {
    assert.deepEqual(fieldsRejected({ station: "0000000" }), ["station"]);
  });

  it("rejects a near-miss station ID", () => {
    assert.deepEqual(fieldsRejected({ station: "8454001" }), ["station"]);
  });

  it("rejects a station with surrounding whitespace", () => {
    assert.deepEqual(fieldsRejected({ station: " 8454000" }), ["station"]);
  });

  it("rejects an empty station value", () => {
    assert.deepEqual(fieldsRejected({ station: "" }), ["station"]);
  });

  it("rejects a repeated station parameter", () => {
    assert.deepEqual(fieldsRejected({ station: ["8454000", "8454000"] }), ["station"]);
  });

  it("rejects a product that is not allowlisted, including a valid NOAA product name", () => {
    assert.deepEqual(fieldsRejected({ product: "salinity" }), ["product"]);
  });

  it("rejects a product with different letter case", () => {
    assert.deepEqual(fieldsRejected({ product: "Water_Temperature" }), ["product"]);
  });

  it("rejects non-integer, non-numeric, and signed range values", () => {
    for (const range of ["abc", "24.5", "1e2", " 24", "-1", "+24", "0x18", ""]) {
      assert.deepEqual(fieldsRejected({ range }), ["range"], `range=${JSON.stringify(range)}`);
    }
  });

  it("rejects range values outside 1 to 72", () => {
    assert.deepEqual(fieldsRejected({ range: "0" }), ["range"]);
    assert.deepEqual(fieldsRejected({ range: "73" }), ["range"]);
    assert.deepEqual(fieldsRejected({ range: "999999" }), ["range"]);
  });

  it("rejects a repeated range parameter", () => {
    assert.deepEqual(fieldsRejected({ range: ["24", "48"] }), ["range"]);
  });

  it("rejects unknown query parameters", () => {
    assert.deepEqual(fieldsRejected({ station: "8454000", cacheBust: "1" }), ["cacheBust"]);
  });

  it("reports every problem in one error instead of stopping at the first", () => {
    assert.deepEqual(
      fieldsRejected({ station: "0000000", product: "salinity", range: "abc" }),
      ["station", "product", "range"]
    );
  });
});
