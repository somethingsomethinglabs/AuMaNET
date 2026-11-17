/* Host test provider only: Windows CNG, never compiled into firmware/APKs. */
#include <windows.h>
#include <bcrypt.h>
#include <stdint.h>
#include <string.h>
#include <stddef.h>
/* BCryptHash needs an algorithm handle on older Windows versions. */
int host_sha(const uint8_t*p,size_t n,uint8_t out[32]){BCRYPT_ALG_HANDLE a=NULL;int ok=BCryptOpenAlgorithmProvider(&a,BCRYPT_SHA256_ALGORITHM,NULL,0)==0;if(ok)ok=n<=UINT32_MAX&&BCryptHash(a,NULL,0,(PUCHAR)p,(ULONG)n,out,32)==0;if(a)BCryptCloseAlgorithmProvider(a,0);return ok;}
static BCRYPT_KEY_HANDLE imported(const uint8_t*der,size_t n,const uint8_t pin[32],BCRYPT_ALG_HANDLE *algorithm){
 static const uint8_t prefix[]={0x30,0x59,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x03,0x42,0x00,0x04};
 uint8_t digest[32],blob[sizeof(BCRYPT_ECCKEY_BLOB)+64];BCRYPT_KEY_HANDLE key=NULL;
 if(!der||!pin||n!=91||memcmp(der,prefix,sizeof prefix)||!host_sha(der,n,digest)||memcmp(digest,pin,32))return NULL;
 BCRYPT_ECCKEY_BLOB header={BCRYPT_ECDSA_PUBLIC_P256_MAGIC,32};memcpy(blob,&header,sizeof header);memcpy(blob+sizeof header,der+27,64);
 if(BCryptOpenAlgorithmProvider(algorithm,BCRYPT_ECDSA_P256_ALGORITHM,NULL,0)!=0)return NULL;
 if(BCryptImportKeyPair(*algorithm,NULL,BCRYPT_ECCPUBLIC_BLOB,&key,blob,sizeof blob,0)!=0)return NULL;return key;
}
int ag_crypto_key_valid(const uint8_t*der,size_t n,const uint8_t pin[32]){BCRYPT_ALG_HANDLE a=NULL;BCRYPT_KEY_HANDLE key=imported(der,n,pin,&a);int ok=key!=NULL;if(key)BCryptDestroyKey(key);if(a)BCryptCloseAlgorithmProvider(a,0);return ok;}
int ag_crypto_verify(const uint8_t*der,size_t n,const uint8_t pin[32],const uint8_t*body,size_t bytes,const uint8_t*sig,size_t length){
 uint8_t raw[64]={0},digest[32];if(!sig||length<8||length>72||sig[0]!=0x30||sig[1]!=length-2)return 0;size_t pos=2;
 for(unsigned i=0;i<2;i++){if(pos+2>length||sig[pos++]!=2)return 0;size_t count=sig[pos++];if(!count||count>33||pos+count>length||(sig[pos]&128))return 0;if(count>1&&sig[pos]==0){if(!(sig[pos+1]&128))return 0;pos++;count--;}if(count>32)return 0;memcpy(raw+i*32+32-count,sig+pos,count);pos+=count;}
 if(pos!=length||!host_sha(body,bytes,digest))return 0;BCRYPT_ALG_HANDLE a=NULL;BCRYPT_KEY_HANDLE key=imported(der,n,pin,&a);int ok=key&&BCryptVerifySignature(key,NULL,digest,32,raw,64,0)==0;if(key)BCryptDestroyKey(key);if(a)BCryptCloseAlgorithmProvider(a,0);return ok;
}
