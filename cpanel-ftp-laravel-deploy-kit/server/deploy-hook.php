<?php
// ═══════════════════════════════════════════════════════════════════════════
//  deploy-hook.php  —  STANDALONE / MANUAL COPY
//
//  The GitHub Actions workflow normally GENERATES this file and uploads it to
//  <project>/public/deploy-hook.php, injecting the config automatically.
//  This copy exists so you can (a) read the logic with syntax highlighting,
//  (b) drop it on a server by hand to debug a deploy that never got that far.
//
//  If you use this copy manually: edit the $CFG block below, upload it to
//  <project>/public/deploy-hook.php, then visit
//      https://your-domain.com/deploy-hook.php?token=YOUR_SECRET&action=health
//
//  Kept deliberately PHP 7.0-compatible (no arrow fns, no ??, no str_contains)
//  so that on a mis-configured host `action=health` can still TELL you the PHP
//  version is wrong instead of dying with a blank 500.
// ═══════════════════════════════════════════════════════════════════════════

$CFG = array(
    // sha256 of your DEPLOY_SECRET. Generate with:
    //   php -r "echo hash('sha256','MySuperSecretKey2026');"
    'secret_hash' => 'PUT_THE_SHA256_OF_YOUR_DEPLOY_SECRET_HERE',

    // Artisan commands run by ?action=artisan, in order. Failures are recorded
    // but never abort the run — you always get the full report back.
    'commands' => array(
        'config:clear',
        'route:clear',
        'view:clear',
        'migrate --force',
        // 'db:seed --force',   // ONLY if your DatabaseSeeder is idempotent
        'cache:clear',
        'storage:link',
        'config:cache',
        'event:cache',
        'view:cache',
        // 'route:cache',       // ONLY if routes/*.php has NO closure routes
    ),
);

// ═══════════════════════════════════════════════════════════════════════════
//  Everything below this line is identical to the generated version.
// ═══════════════════════════════════════════════════════════════════════════

@ini_set('max_execution_time', '600');
@set_time_limit(600);
@ignore_user_abort(true);
@ini_set('memory_limit', '512M');

header('Content-Type: application/json');

// public/ is the web root, so the project root is one level up.
$ROOT   = dirname(__DIR__);
$token  = isset($_GET['token'])  ? (string) $_GET['token']  : '';
$action = isset($_GET['action']) ? (string) $_GET['action'] : 'health';
$mode   = isset($_GET['mode'])   ? (string) $_GET['mode']   : 'auto';

// ── Gate ───────────────────────────────────────────────────────────────────
// The plaintext secret never lands on the server: only its sha256 does.
if (empty($CFG['secret_hash']) || !hash_equals($CFG['secret_hash'], hash('sha256', $token))) {
    http_response_code(403);
    echo json_encode(array('error' => 'forbidden'));
    exit;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function reply($payload, $code = 200)
{
    http_response_code($code);
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

function funcEnabled($name)
{
    if (!function_exists($name)) {
        return false;
    }
    $disabled = str_replace(' ', '', (string) ini_get('disable_functions'));
    return !in_array($name, explode(',', $disabled), true);
}

/**
 * Zip archives do not carry empty directories, and Laravel refuses to boot
 * without these. Recreate the skeleton on every deploy.
 */
function ensureSkeleton($root)
{
    $dirs = array(
        'storage',
        'storage/app',
        'storage/app/public',
        'storage/app/private',
        'storage/framework',
        'storage/framework/cache',
        'storage/framework/cache/data',
        'storage/framework/sessions',
        'storage/framework/testing',
        'storage/framework/views',
        'storage/logs',
        'bootstrap/cache',
    );
    $created = array();
    foreach ($dirs as $rel) {
        $dir = $root . '/' . $rel;
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
            $created[] = $rel;
        }
        @chmod($dir, 0775);
    }
    return $created;
}

/**
 * The `php` on a shared host's PATH is very often an ancient PHP 5.x stub,
 * which is why exec('php artisan ...') mysteriously fails while the site
 * itself runs on 8.x. Prefer the CLI binary matching the web SAPI version.
 */
function findPhpBinary()
{
    $v      = PHP_MAJOR_VERSION . PHP_MINOR_VERSION;              // "82"
    $dotted = PHP_MAJOR_VERSION . '.' . PHP_MINOR_VERSION;        // "8.2"
    $candidates = array(
        '/opt/cpanel/ea-php' . $v . '/root/usr/bin/php',          // cPanel EasyApache
        '/usr/local/bin/ea-php' . $v,                             // cPanel alias
        '/opt/alt/php' . $v . '/usr/bin/php',                     // CloudLinux alt-php
        '/opt/plesk/php/' . $dotted . '/bin/php',                 // Plesk
        '/usr/bin/php' . $dotted,                                 // Debian/Ubuntu (CloudPanel)
        '/usr/local/bin/php' . $dotted,
        '/usr/local/bin/php',
        '/usr/bin/php',
    );
    foreach ($candidates as $bin) {
        if (@is_executable($bin)) {
            return $bin;
        }
    }
    return 'php';
}

/** "migrate --force" / "db:seed --class=X" -> array("migrate", array("--force" => true)) */
function parseCommand($line)
{
    $parts  = preg_split('/\s+/', trim($line));
    $name   = array_shift($parts);
    $params = array();
    foreach ($parts as $p) {
        if (strpos($p, '--') === 0) {
            $p = substr($p, 2);
            if (strpos($p, '=') !== false) {
                $kv = explode('=', $p, 2);
                $params['--' . $kv[0]] = $kv[1];
            } else {
                $params['--' . $p] = true;
            }
        } else {
            $params[] = $p;
        }
    }
    return array($name, $params);
}

/**
 * PREFERRED PATH: boot Laravel in this very process and drive the console
 * kernel directly. Immune to exec() being disabled AND to the PATH `php`
 * being the wrong version — it is by definition the same PHP the site runs on.
 * Returns null if the app cannot be booted (caller then falls back to exec).
 */
function runInProcess($root, $commands)
{
    $autoload  = $root . '/vendor/autoload.php';
    $bootstrap = $root . '/bootstrap/app.php';
    if (!is_file($autoload) || !is_file($bootstrap)) {
        return null;
    }
    // Some packages inspect argv even outside the CLI SAPI.
    if (!isset($_SERVER['argv'])) {
        $_SERVER['argv'] = array('artisan');
        $_SERVER['argc'] = 1;
    }
    try {
        require_once $autoload;
        $app    = require $bootstrap;
        $kernel = $app->make('Illuminate\Contracts\Console\Kernel');
    } catch (Throwable $e) {
        return null;
    }

    $results = array();
    foreach ($commands as $line) {
        list($name, $params) = parseCommand($line);
        $started = microtime(true);
        try {
            $exit   = (int) $kernel->call($name, $params);
            $output = trim((string) $kernel->output());
        } catch (Throwable $e) {
            $exit   = 1;
            $output = get_class($e) . ': ' . $e->getMessage();
        }
        $results[] = array(
            'cmd'    => $line,
            'exit'   => $exit,
            'ms'     => (int) round((microtime(true) - $started) * 1000),
            'output' => substr($output, 0, 4000),
        );
    }
    return $results;
}

/** FALLBACK PATH: shell out, using the best CLI binary we can find. */
function runViaExec($root, $commands)
{
    if (!funcEnabled('exec')) {
        return array(array(
            'cmd'    => '(exec)',
            'exit'   => 127,
            'ms'     => 0,
            'output' => 'exec() is disabled by disable_functions and Laravel could not be '
                      . 'booted in-process. Run the artisan commands from cPanel Terminal / SSH.',
        ));
    }
    $php     = findPhpBinary();
    $results = array();
    foreach ($commands as $line) {
        $lines   = array();
        $exit    = 0;
        $started = microtime(true);
        @exec(escapeshellarg($php) . ' artisan ' . $line . ' 2>&1', $lines, $exit);
        $results[] = array(
            'cmd'    => $php . ' artisan ' . $line,
            'exit'   => (int) $exit,
            'ms'     => (int) round((microtime(true) - $started) * 1000),
            'output' => substr(implode("\n", $lines), 0, 4000),
        );
    }
    return $results;
}

// ── ACTION: health ─────────────────────────────────────────────────────────
// Read-only. Run this FIRST when a deploy misbehaves — it answers most
// "why is it 500-ing" questions in one shot.
if ($action === 'health') {
    $version = null;
    if (is_file($ROOT . '/deploy-version.txt')) {
        $version = trim(file_get_contents($ROOT . '/deploy-version.txt'));
    }
    reply(array(
        'status'          => 'hook_alive',
        'php_version'     => PHP_VERSION,
        'php_sapi'        => PHP_SAPI,
        'php_cli_guess'   => findPhpBinary(),
        'project_root'    => $ROOT,
        'deployed'        => $version,
        'zip_extension'   => class_exists('ZipArchive'),
        'exec_available'  => funcEnabled('exec'),
        'symlink_allowed' => funcEnabled('symlink'),
        'opcache'         => function_exists('opcache_reset'),
        'free_space_mb'   => (int) round((float) @disk_free_space($ROOT) / 1048576),
        'max_upload'      => ini_get('upload_max_filesize'),
        'memory_limit'    => ini_get('memory_limit'),
        'present'         => array(
            'vendor'     => is_dir($ROOT . '/vendor'),
            'env'        => is_file($ROOT . '/.env'),
            'artisan'    => is_file($ROOT . '/artisan'),
            'build'      => is_dir($ROOT . '/public/build'),
            'deploy_zip' => is_file($ROOT . '/deploy.zip'),
        ),
        'writable'        => array(
            'root'            => is_writable($ROOT),
            'storage'         => is_writable($ROOT . '/storage'),
            'bootstrap_cache' => is_writable($ROOT . '/bootstrap/cache'),
            'public'          => is_writable($ROOT . '/public'),
        ),
    ));
}

// ── ACTION: unzip ──────────────────────────────────────────────────────────
if ($action === 'unzip') {
    if (!class_exists('ZipArchive')) {
        reply(array(
            'status' => 'zip_ext_missing',
            'msg'    => 'The PHP zip extension is not enabled for the web SAPI. '
                      . 'Enable it in cPanel -> Select PHP Version -> Extensions -> zip.',
        ), 500);
    }
    $zipPath = $ROOT . '/deploy.zip';
    if (!is_file($zipPath)) {
        reply(array(
            'status' => 'no_zip',
            'msg'    => 'deploy.zip not found in ' . $ROOT . ' — the FTP upload did not land here. '
                      . 'Check the FTP_SERVER_DIR variable.',
        ), 404);
    }

    $bytes = filesize($zipPath);
    $zip   = new ZipArchive();
    $open  = $zip->open($zipPath);
    if ($open !== true) {
        reply(array(
            'status' => 'unzip_failed',
            'code'   => $open,
            'msg'    => 'ZipArchive::open() failed — usually a truncated upload. Re-run the workflow.',
        ), 500);
    }
    $files = $zip->numFiles;
    $ok    = $zip->extractTo($ROOT);
    $zip->close();
    if (!$ok) {
        reply(array(
            'status' => 'extract_failed',
            'msg'    => 'Extraction failed — most often no free disk space or a read-only directory.',
        ), 500);
    }
    @unlink($zipPath);

    $created = ensureSkeleton($ROOT);
    if (function_exists('opcache_reset')) {
        @opcache_reset();      // new code on disk, stale bytecode in memory
    }
    clearstatcache(true);

    reply(array(
        'status'       => 'unzipped_ok',
        'files'        => $files,
        'zip_bytes'    => $bytes,
        'created_dirs' => $created,
    ));
}

// ── ACTION: artisan ────────────────────────────────────────────────────────
if ($action === 'artisan') {
    @chdir($ROOT);
    $created  = ensureSkeleton($ROOT);
    $commands = isset($CFG['commands']) ? $CFG['commands'] : array();

    $used    = 'in-process';
    $results = null;
    if ($mode !== 'exec') {
        $results = runInProcess($ROOT, $commands);
    }
    if ($results === null) {
        $used    = 'exec';
        $results = runViaExec($ROOT, $commands);
    }

    // storage:link is the single most fragile command on shared hosting.
    // If it did not produce the symlink, try the raw call ourselves.
    $link = $ROOT . '/public/storage';
    if (!file_exists($link) && funcEnabled('symlink')) {
        @symlink($ROOT . '/storage/app/public', $link);
    }

    if (function_exists('opcache_reset')) {
        @opcache_reset();
    }

    $failed = array();
    foreach ($results as $r) {
        if ($r['exit'] !== 0) {
            $failed[] = $r['cmd'];
        }
    }

    reply(array(
        'status'       => count($failed) ? 'done_with_errors' : 'done',
        'mode'         => $used,
        'created_dirs' => $created,
        'storage_link' => file_exists($link),
        'failed_count' => count($failed),
        'failed'       => $failed,
        'results'      => $results,
    ));
}

reply(array('error' => 'unknown action', 'known' => array('health', 'unzip', 'artisan')), 400);
