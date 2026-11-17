package au.aumanet.app;

import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

/** Bounded transport primitives. TLS supplies encryption/integrity; these do not replace it. */
final class GroupWire {
    static final int MAX_BYTES = 98304;
    static final int MAX_MEMBERS = 5;
    static final long INVITE_MS = 300000;
    private static final SecureRandom RANDOM = new SecureRandom();
    static String random(int bytes) { byte[] data = new byte[bytes]; RANDOM.nextBytes(data); return hex(data).toLowerCase(java.util.Locale.ROOT); }
    static String hex(byte[] data) { StringBuilder result = new StringBuilder(data.length * 2); for (byte value : data) result.append(String.format(java.util.Locale.ROOT, "%02X", value & 255)); return result.toString(); }
    static boolean pin(String value) { return value != null && value.matches("[A-F0-9]{64}"); }
    static boolean id(String value) { return value != null && value.matches("[a-f0-9]{32}"); }
    static boolean equal(String a, String b) {
        return a != null && b != null && MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }
    static String privateIPv4(String value) {
        if (value == null || !value.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) throw new IllegalArgumentException("Expected a private IPv4 address");
        String[] parts = value.split("\\."); int[] n = new int[4];
        for (int i = 0; i < 4; i++) { n[i] = Integer.parseInt(parts[i]); if (n[i] > 255 || !Integer.toString(n[i]).equals(parts[i])) throw new IllegalArgumentException("Invalid IPv4 address"); }
        if (!(n[0] == 10 || n[0] == 172 && n[1] >= 16 && n[1] <= 31 || n[0] == 192 && n[1] == 168)) throw new IllegalArgumentException("Only private Wi-Fi addresses are allowed");
        return value;
    }
    static void requireEpoch(long expected, long received) {
        if(expected < 1 || received != expected)throw new IllegalArgumentException("Inactive group epoch");
    }
    static String read(DataInputStream input) throws IOException {
        int length = input.readInt(); if (length <= 0 || length > MAX_BYTES) throw new IOException("Group frame length exceeded");
        byte[] bytes = new byte[length]; input.readFully(bytes);
        return decode(bytes);
    }
    /** Preserve partial frame bytes across a socket timeout only while an exact
     * authenticated radio-maintenance lease remains live. EOF and other I/O
     * errors always end the transport; the guard cannot extend its own lease. */
    static String read(DataInputStream input, java.util.function.BooleanSupplier retainTimeout) throws IOException {
        byte[] header = new byte[4];
        readRetained(input, header, retainTimeout);
        int length = ByteBuffer.wrap(header).getInt();
        if (length <= 0 || length > MAX_BYTES) throw new IOException("Group frame length exceeded");
        byte[] bytes = new byte[length];
        readRetained(input, bytes, retainTimeout);
        return decode(bytes);
    }
    private static void readRetained(DataInputStream input, byte[] bytes, java.util.function.BooleanSupplier retainTimeout) throws IOException {
        int offset = 0;
        while (offset < bytes.length) {
            try {
                int count = input.read(bytes, offset, bytes.length - offset);
                if (count < 0) throw new java.io.EOFException();
                if (count == 0) throw new IOException("Group read made no progress");
                offset += count;
            } catch (java.net.SocketTimeoutException timeout) {
                if (timeout.bytesTransferred < 0 || timeout.bytesTransferred > bytes.length - offset) throw timeout;
                offset += timeout.bytesTransferred;
                if (!retainTimeout.getAsBoolean()) throw timeout;
            }
        }
    }
    static String decode(byte[] bytes) throws IOException {
        if(bytes.length>MAX_BYTES)throw new IOException("Group text length exceeded");
        try { return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString(); }
        catch (CharacterCodingException invalid) { throw new IOException("Malformed group UTF-8", invalid); }
    }
    static void write(DataOutputStream output, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8); if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("Group frame length exceeded");
        output.writeInt(bytes.length); output.write(bytes); output.flush();
    }
    static final class Sequence {
        private final String group, connection;
        private long received;
        Sequence(String group, String connection) {
            if (!id(group) || !id(connection)) throw new IllegalArgumentException("Invalid group connection binding");
            this.group = group; this.connection = connection;
        }
        synchronized void accept(String group, String connection, long sequence) {
            if (!this.group.equals(group) || !this.connection.equals(connection) || sequence != received + 1 || sequence > 9007199254740991L)
                throw new IllegalArgumentException("Wrong group, stale connection or replayed frame");
            received = sequence;
        }
    }
    static final class Invite {
        final String token = random(32);
        final long expiresElapsed;
        private boolean consumed;
        Invite(long now) { expiresElapsed = now + INVITE_MS; }
        synchronized boolean available(long now) { return !consumed && now >= 0 && now < expiresElapsed; }
        synchronized boolean consume(String candidate, long now) {
            if (!available(now) || !equal(token, candidate)) return false;
            consumed = true; return true;
        }
    }
}
