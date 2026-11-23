import Constants from "expo-constants";

const appVariant = Constants.expoConfig?.extra?.appVariant;

export const DAYCREW_NAME = "Daycrew";

export const DAYCREW_BRAND_MARK_SOURCE =
  appVariant === "development"
    ? require("../../../../assets/daycrew/dev/apple-touch-icon.png")
    : require("../../../../assets/daycrew/apple-touch-icon.png");
