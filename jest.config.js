/** Unit tests for the pure parts of the widget, plus a jsdom smoke test of the whole grid (AGGrid.smoke.test.tsx). */
module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/src"],
    testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
    transform: {
        "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx", esModuleInterop: true, module: "commonjs", target: "es2020", strict: true, skipLibCheck: true } }]
    },
    moduleNameMapper: {
        "^mendix/filters/builders$": "<rootDir>/src/__mocks__/mendixFilters.ts",
        "\\.css$": "<rootDir>/src/__mocks__/styleMock.ts"
    }
};
