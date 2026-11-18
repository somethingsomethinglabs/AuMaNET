declare module 'lerc' {
  const lerc: {
    decode(bytes: ArrayBuffer): {
      width: number;
      height: number;
      pixels: Float32Array[];
      mask: Uint8Array | null;
    };
  };
  export default lerc;
}
