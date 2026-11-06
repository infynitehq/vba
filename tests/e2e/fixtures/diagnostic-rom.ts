// Original ARM program: fill the GBA display red, then loop forever.
// No commercial ROM, BIOS, or Nintendo logo is needed by mGBA.
export function diagnosticRom() {
  const rom = Buffer.alloc(1024);
  rom.writeUInt32LE(0xea00002e, 0); // Branch over the cartridge header.
  rom.write('DISPLAY TEST', 0xa0);
  rom.write('TEST', 0xac);
  rom.write('00', 0xb0);
  rom[0xb2] = 0x96;
  let checksum = 0;
  for (let i = 0xa0; i <= 0xbc; i++) checksum -= rom[i];
  rom[0xbd] = (checksum - 0x19) & 0xff;
  const program = [
    0xe59f0024, // ldr r0, DISPCNT
    0xe3a01c04, // mov r1, #0x400 (background 2)
    0xe2811003, // add r1, r1, #3 (bitmap mode 3)
    0xe1c010b0, // strh r1, [r0]
    0xe59f0018, // ldr r0, VRAM
    0xe3a0101f, // mov r1, #31 (red)
    0xe59f2014, // ldr r2, pixel count
    0xe0c010b2, // strh r1, [r0], #2
    0xe2522001, // subs r2, r2, #1
    0x1afffffc, // bne fill
    0xeafffffe, // b forever
    0x04000000,
    0x06000000,
    240 * 160,
  ];
  program.forEach((instruction, i) =>
    rom.writeUInt32LE(instruction, 0xc0 + i * 4),
  );
  return rom;
}
