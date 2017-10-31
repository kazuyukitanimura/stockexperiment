{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "src/addon.cc",
        "src/sma.cc",
        "src/tradeController.cc",
        "src/IbClient.cc",
        "<!@(ls -1 IBJts/source/CppClient/client/*.cpp)",
      ],
      "defines": [
      ],
      "include_dirs": [
        "IBJts/source/CppClient/client",
      ],
      "cflags":  ["-ffast-math", "-fexpensive-optimizations", "-DNDEBUG", "-march=native", "-std=c++11"],
      "cflags_cc": ["-ffast-math", "-fexpensive-optimizations", "-DNDEBUG", "-march=native", "-std=c++11"],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "conditions": [
        ['OS=="mac"', {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "OTHER_CPLUSPLUSFLAGS": ["-ffast-math", "-DNDEBUG", "-march=native", "-std=c++11"],
          },
        }],
      ]
    }
  ]
}
