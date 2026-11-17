package au.aumanet.app;import java.util.function.BooleanSupplier;
/** Explicit test boundary; actual controller binding is covered by its actor suite. */
final class TrustedConnectionController{static MessageBinding binding;static final class MessageBinding{final Object key;final BooleanSupplier current;MessageBinding(Object key,BooleanSupplier current){this.key=key;this.current=current;}}static MessageBinding messageOwner(String group,String self,long epoch){return binding;}}
