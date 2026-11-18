plugins {
    id("com.android.application")
}

android {
    namespace = "dev.kokoichi.lifeconsole"
    compileSdk = 37

    defaultConfig {
        applicationId = "dev.kokoichi.lifeconsole"
        minSdk = 31
        targetSdk = 36
        versionCode = 8
        versionName = "0.5.1"
        buildConfigField(
            "String",
            "MEAL_API_ORIGIN",
            "\"https://life-console.kokoichi206.workers.dev\"",
        )
        buildConfigField("boolean", "MEAL_API_USES_OAUTH", "true")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            buildConfigField("String", "MEAL_API_ORIGIN", "\"http://127.0.0.1:8790\"")
            buildConfigField("boolean", "MEAL_API_USES_OAUTH", "false")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(libs.appauth)
    implementation(libs.subject.segmentation)
    implementation(libs.androidx.core)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}
