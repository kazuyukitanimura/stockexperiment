rm -rf IBJts
#wget -c http://interactivebrokers.github.io/downloads/twsapi_macunix.972.18.zip
unzip twsapi_macunix.972.18.zip
rm -rf META-INF

# http://stackoverflow.com/questions/5694228/sed-in-place-flag-that-works-both-on-mac-bsd-and-linux
sed -i.bak 's/assert(dynamic_cast/\/\/assert(dynamic_cast/' IBJts/source/CppClient/client/EClientSocket.cpp
sed -i.bak 's/min/std::min/' IBJts/source/CppClient/client/EReader.cpp
sed -i.bak 's/TICK_SIZE:/TICK_SIZE:break;/' IBJts/source/CppClient/client/EDecoder.cpp
sed -i.bak 's/TICK_OPTION_COMPUTATION:/TICK_OPTION_COMPUTATION:break;/' IBJts/source/CppClient/client/EDecoder.cpp
sed -i.bak 's/TICK_GENERIC:/TICK_GENERIC:break;/' IBJts/source/CppClient/client/EDecoder.cpp
sed -i.bak 's/TICK_STRING:/TICK_STRING:break;/' IBJts/source/CppClient/client/EDecoder.cpp
sed -i.bak 's/TICK_EFP:/TICK_EFP:break;/' IBJts/source/CppClient/client/EDecoder.cpp
sed -i.bak 's/m_pEWrapper->tickSize/;\/\/m_pEWrapper->tickSize/' IBJts/source/CppClient/client/EDecoder.cpp
