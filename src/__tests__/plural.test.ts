import { rowsLabel } from "../components/Chrome";
import { fill } from "../utils/texts";

describe("count texts", () => {
    it("uses the singular after a count of one", () => {
        expect(fill("[count] rows", { count: 1 })).toBe("1 row");
        expect(fill("Delete [count] rows", { count: 1 })).toBe("Delete 1 row");
        expect(fill("[count] matches in [rows] rows", { count: 1, rows: 1 })).toBe("1 match in 1 row");
        expect(fill("Replaced [count] values", { count: 1 })).toBe("Replaced 1 value");
    });
    it("keeps plurals and other languages", () => {
        expect(fill("[count] rows", { count: 2 })).toBe("2 rows");
        expect(fill("[count] rows", { count: 0 })).toBe("0 rows");
        expect(fill("[count] Zeilen", { count: 1 })).toBe("1 Zeilen");
        expect(fill("[count] rows", { count: 11 })).toBe("11 rows");
    });
    it("labels the status bar counter", () => {
        expect(rowsLabel("[count] rows", 1)).toBe("row");
        expect(rowsLabel("[count] rows", 39)).toBe("rows");
        expect(rowsLabel("Rows: [count]", 1)).toBe("Rows:");
    });
});
