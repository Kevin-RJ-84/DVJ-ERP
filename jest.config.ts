import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      testMatch: [
        "<rootDir>/tests/unit/**/*.test.ts",
        "<rootDir>/tests/api/**/*.test.ts",
        "<rootDir>/tests/security/**/*.test.ts",
        "<rootDir>/tests/regression/**/*.test.ts",
        "<rootDir>/tests/performance/**/*.test.ts",
      ],
      // Allow Jest to transform ESM-only packages (jose) in addition to project files.
      transformIgnorePatterns: ["node_modules/(?!(jose)/)"],
      transform: {
        "^.+\\.[tj]sx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "CommonJS",
              moduleResolution: "node",
              esModuleInterop: true,
              strict: false,
              allowJs: true,
            },
          },
        ],
      },
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^next/server$": "<rootDir>/tests/__mocks__/next-server.ts",
        "^next/navigation$": "<rootDir>/tests/__mocks__/next-navigation.ts",
        "^next/headers$": "<rootDir>/tests/__mocks__/next-headers.ts",
      },
      setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
    },
    {
      displayName: "components",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/tests/components/**/*.test.tsx"],
      transformIgnorePatterns: ["node_modules/(?!(jose)/)"],
      transform: {
        "^.+\\.[tj]sx?$": [
          "ts-jest",
          {
            tsconfig: {
              module: "CommonJS",
              moduleResolution: "node",
              esModuleInterop: true,
              jsx: "react-jsx",
              strict: false,
              allowJs: true,
            },
          },
        ],
      },
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
        "^next/server$": "<rootDir>/tests/__mocks__/next-server.ts",
        "^next/navigation$": "<rootDir>/tests/__mocks__/next-navigation.ts",
        "^next/headers$": "<rootDir>/tests/__mocks__/next-headers.ts",
      },
      setupFilesAfterEnv: [
        "<rootDir>/tests/setup.ts",
        "@testing-library/jest-dom",
      ],
    },
  ],
  collectCoverageFrom: [
    "lib/**/*.ts",
    "app/api/**/*.ts",
    "components/**/*.tsx",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: { lines: 80 },
  },
};

export default config;
