import com.google.gson.Gson;
import com.gestortorneos.desktop.DesktopTournamentSummary;
import com.gestortorneos.desktop.WindowsManagementSessionStorage;
import com.gestortorneos.ui.ManagementSessionController;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import kotlin.ResultKt;
import kotlin.Unit;
import kotlin.coroutines.Continuation;
import kotlin.coroutines.CoroutineContext;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.coroutines.intrinsics.IntrinsicsKt;
import okhttp3.OkHttpClient;
import okhttp3.Request;

/** Runs with the shipped JARs and runtime, without Gradle/JUnit on the classpath. */
public final class PackagedManagementSessionChecks {
    private static final String TOKEN = "a".repeat(64);

    @FunctionalInterface
    interface SuspendedCall { Object run(Continuation<? super Unit> continuation); }

    private static void await(SuspendedCall call) throws Exception {
        var completed = new CompletableFuture<Object>();
        Object result = call.run(new Continuation<Unit>() {
            public CoroutineContext getContext() { return EmptyCoroutineContext.INSTANCE; }
            public void resumeWith(Object result) { completed.complete(result); }
        });
        if (result == IntrinsicsKt.getCOROUTINE_SUSPENDED()) result = completed.get(15, TimeUnit.SECONDS);
        ResultKt.throwOnFailure(result);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) {
        try {
            check(args);
            // OkHttp can keep idle threads alive after the checks complete.
            System.exit(0);
        } catch (Throwable failure) {
            failure.printStackTrace();
            System.exit(1);
        }
    }

    private static void check(String[] args) throws Exception {
        String phase = args[0], backend = args[1];
        Path file = Path.of(args[2]);
        var storage = new WindowsManagementSessionStorage(file);
        var session = new ManagementSessionController();
        session.initialize(backend, storage);
        if (phase.equals("login")) {
            require(session.getToken().isEmpty(), "Fresh installation must start logged out");
            await(next -> session.login(backend, " fixture ", " fixture-password ", next));
            require(TOKEN.equals(session.getToken()), "Login response must be decoded");
            require(session.getState().getValue().getUser().getRole().equals("SUPER_ADMIN"), "User must be decoded");
            String saved = storage.read();
            require(saved != null && saved.contains(TOKEN), "Session must be persisted");
            require(!saved.contains("fixture-password"), "Password must not be persisted");
            require(!new String(Files.readAllBytes(file), java.nio.charset.StandardCharsets.UTF_8).contains(TOKEN), "DPAPI must encrypt the token");
            var tournament = new Gson().fromJson("{\"id\":\"t1\",\"title\":\"Fixture\",\"game\":\"SMASH\",\"status\":\"IN_PROGRESS\",\"format\":\"DOUBLE_ELIMINATION\",\"maxParticipants\":32,\"registeredParticipants\":8}", DesktopTournamentSummary.class);
            require(tournament.getId().equals("t1") && tournament.getRegisteredParticipants() == 8, "Tournament DTO must be decoded too");
            require(ModuleLayer.boot().findModule("jdk.unsupported").isPresent(), "Gson runtime module must be shipped");
            System.out.println("PASS: packaged login, user/tournament JSON and encrypted session persistence");
        } else {
            require(TOKEN.equals(session.getToken()), "A new process must restore the saved session");
            var client = new OkHttpClient.Builder().addInterceptor(session.getInterceptor()).build();
            for (int status : new int[] {200, 403, 503, 401}) {
                try (var response = client.newCall(new Request.Builder().url(backend + "/status/" + status)
                        .header("X-Admin-Key", "obsolete").build()).execute()) {
                    require(response.code() == status, "Expected fixture HTTP status");
                }
                require(status == 401 ? session.getToken().isEmpty() : TOKEN.equals(session.getToken()), "Only 401 should clear the session");
            }
            require(storage.read() == null, "401 must clear persistent credentials");
            await(next -> session.login(backend, "fixture", " fixture-password ", next));
            await(session::logout);
            require(session.getToken().isEmpty() && storage.read() == null, "Logout must clear the session");
            System.out.println("PASS: new-process restore, Bearer authentication, 403/503 retention, 401 and logout");
        }
    }
}
