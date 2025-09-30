import { Image, ImageStyle, StyleProp } from "react-native";

type BrandLogoProps = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function BrandLogo({ size = 72, style }: BrandLogoProps) {
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel="QuickQuote logo"
      source={require("../assets/icon.png")}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 5,
        },
        style,
      ]}
      resizeMode="contain"
    />
  );
}

export default BrandLogo;
