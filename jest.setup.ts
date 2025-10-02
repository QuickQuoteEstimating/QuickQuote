import "@testing-library/jest-native/extend-expect";
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Node's test environment does not include the WHATWG stream constructors by
// default.  The Supabase client (via undici) expects `ReadableStream`,
// `WritableStream`, and `TransformStream` to exist on the global scope.  When
// they are missing we see runtime errors such as
// `ReferenceError: ReadableStream is not defined` when the tests exercise code
// that performs network requests.  The `web-streams-polyfill` package ships a
// spec-compliant ponyfill that we can safely expose to the globals Jest uses.
import {
  ReadableStream as NativeReadableStream,
  TransformStream as NativeTransformStream,
  WritableStream as NativeWritableStream,
} from "node:stream/web";

if (!globalThis.ReadableStream) {
  // eslint-disable-next-line no-global-assign
  globalThis.ReadableStream = NativeReadableStream as unknown as typeof globalThis.ReadableStream;
}

if (!globalThis.WritableStream) {
  // eslint-disable-next-line no-global-assign
  globalThis.WritableStream = NativeWritableStream as unknown as typeof globalThis.WritableStream;
}

if (!globalThis.TransformStream) {
  // eslint-disable-next-line no-global-assign
  globalThis.TransformStream =
    NativeTransformStream as unknown as typeof globalThis.TransformStream;
}

jest.mock("react-native/Libraries/Components/Touchable/TouchableOpacity", () => {
  const React = require("react");

  const MockTouchableOpacity = React.forwardRef(({ children, onPress, ...rest }: any, ref: any) => {
    return React.createElement(
      "RNMockTouchableOpacity",
      {
        ...rest,
        onPress,
        ref,
      },
      children,
    );
  });

  MockTouchableOpacity.displayName = "MockTouchableOpacity";

  return MockTouchableOpacity;
});

