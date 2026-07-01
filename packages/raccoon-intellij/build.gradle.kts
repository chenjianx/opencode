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
  // Sidecar (sidecar.cjs) and webview assets are produced by the `bun run build`
  // step in package.json and land under src/main/resources, so they are picked up
  // as plugin resources automatically. Nothing to wire here yet.
  buildSearchableOptions {
    enabled = false
  }

  // For local `runIde`, point the sidecar at the opencode binary already built for the VSCode
  // package (bin/raccoon) if present, so chat works without extra setup. Packaged distributions
  // resolve RACCOON_BIN from the environment or a bundled binary (future work).
  val bundledBin = layout.projectDirectory.dir("../raccoon-vscode/bin").asFile.resolve("raccoon")
  runIde {
    if (bundledBin.exists()) environment("RACCOON_BIN", bundledBin.absolutePath)
  }
}
