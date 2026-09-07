plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.kokoichi.lifeconsole"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.kokoichi.lifeconsole"
        minSdk = 31
        targetSdk = 36
        versionCode = 2
        versionName = "0.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}
