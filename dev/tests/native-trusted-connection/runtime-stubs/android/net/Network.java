package android.net;
public final class Network {public final int id;public Network(int id){this.id=id;}@Override public boolean equals(Object other){return other instanceof Network&&((Network)other).id==id;}@Override public int hashCode(){return id;}}
