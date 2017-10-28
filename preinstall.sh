rm -rf IBJts
#wget -c http://interactivebrokers.github.io/downloads/twsapi_macunix.972.18.zip
unzip twsapi_macunix.972.18.zip
rm -rf META-INF

clientpath=IBJts/source/CppClient/client
# http://stackoverflow.com/questions/5694228/sed-in-place-flag-that-works-both-on-mac-bsd-and-linux
sed -i.bak 's/min/std::min/' ${clientpath}/EReader.cpp
sed -i.bak 's/assert(dynamic_cast/\/\/assert(dynamic_cast/' ${clientpath}/EClientSocket.cpp
sed -i.bak 's/TICK_SIZE:/TICK_SIZE:break;/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/TICK_OPTION_COMPUTATION:/TICK_OPTION_COMPUTATION:break;/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/TICK_GENERIC:/TICK_GENERIC:break;/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/TICK_STRING:/TICK_STRING:break;/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/TICK_EFP:/TICK_EFP:break;/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/m_pEWrapper->tickSize/;\/\/m_pEWrapper->tickSize/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/bool EDecoder::CheckOffset/inline bool EDecoder::CheckOffset/' ${clientpath}/EDecoder.cpp
sed -i.bak 's/const char\* EDecoder::FindFieldEnd/inline const char\* EDecoder::FindFieldEnd/' ${clientpath}/EDecoder.cpp
