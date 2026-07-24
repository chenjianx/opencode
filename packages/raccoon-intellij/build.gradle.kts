plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "2.1.0"
  id("org.jetbrains.intellij.platform") version "2.2.1"
}

group = "ai.opencode"
version = "0.0.0"

repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
  }
}

dependencies {
  intellijPlatform {
    // Community edition is enough — we only need the platform + JCEF.
    intellijIdeaCommunity("2024.2")
  }
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild = "242"
      untilBuild = provider { null }
    }
  }
}

// IntelliJ Platform 2024.2 advises Java 21, but the only JDK registered here is 17 and Gradle
// 8.13 can't run on JDK 25. 17 bytecode loads fine in the 21 runtime, so we build with 17 and
// accept the verifier's advisory warning for this MVP.
kotlin {
  jvmToolchain(17)
}

tasks {
  val raccoonVscode = layout.projectDirectory.dir("../raccoon-vscode").asFile
  val opencodeDir = layout.projectDirectory.dir("../opencode").asFile
  val localRun = gradle.startParameter.taskNames.any { it == "runIde" || it.endsWith(":runIde") }
  val prepareRaccoonBinaries = register<Exec>("prepareRaccoonBinaries") {
    workingDir(raccoonVscode)
    commandLine("bun", "run", "build:cli")
  }

  if (!localRun) {
    processResources {
      dependsOn(prepareRaccoonBinaries)
      listOf(
        Triple("darwin-arm64", "darwin-arm64", "raccoon"),
        Triple("darwin-x64", "darwin-x64", "raccoon"),
        Triple("linux-arm64-musl", "linux-arm64-musl", "raccoon"),
        Triple("linux-x64-musl", "linux-x64-musl", "raccoon"),
        Triple("linux-arm64", "linux-arm64", "raccoon"),
        Triple("linux-x64", "linux-x64", "raccoon"),
        Triple("windows-arm64", "win32-arm64", "raccoon.exe"),
        Triple("windows-x64", "win32-x64", "raccoon.exe"),
      ).forEach { (sourceTarget, resourceTarget, name) ->
        from(opencodeDir.resolve("dist/raccoon-$sourceTarget/bin/$name")) {
          into("bin/$resourceTarget")
          rename { name }
        }
      }
    }
  }

  buildSearchableOptions {
    enabled = false
  }

  runIde {
    environment("RACCOON_SOURCE_DIR", opencodeDir.absolutePath)
    environment("RACCOON_BUN", "bun")
  }
}
