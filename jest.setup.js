/* eslint-env jest */
/**
 * AsyncStorage is a native module, so tests get an in-memory stand-in.
 * (v3 no longer ships its own jest mock.)
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(key => Promise.resolve(key in store ? store[key] : null)),
      setItem: jest.fn((key, value) => {
        store[key] = value;
        return Promise.resolve();
      },),
      removeItem: jest.fn(key => {
        delete store[key];
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        store = {};
        return Promise.resolve();
      }),
    },
  };
});
