// 源码侧系统 API 声明。
//
// 这些对象是设备 bridge 的类型标记。它们按开发者心智分组，后端仍按目标平台
// 的真实 feature 名称生成产物，不能在开发机 JS runtime 中直接执行。

export type BridgeValue = unknown;
export type BridgeCallback<Args extends unknown[] = []> = (
  ...args: Args
) => void;
export type BridgeFailCallback = (errMsg: string, errCode: number) => void;

export interface CallbackOptions<Success = BridgeValue> {
  success?: BridgeCallback<[Success]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface LocaleInfo {
  language: string;
  countryOrRegion: string;
}

export interface RouteObject {
  uri: string;
  params?: Record<string, BridgeValue>;
}

export interface RouterBackOptions {
  path?: string;
}

export interface RouteStack {
  name: string;
  path: string;
}

export interface RouteState extends RouteStack {
  index: number;
}

export interface RouterApi {
  getPages(): RouteStack[];
  push(options: RouteObject): void;
  replace(options: RouteObject): void;
  back(options?: RouterBackOptions): void;
  clear(): void;
  getLength(): number;
  getState(): RouteState;
}

export interface AppSource {
  [key: string]: BridgeValue;
}

export interface AppInfo {
  packageName: string;
  name: string;
  versionName: string;
  versionCode: number;
  icon: string;
  logLevel: string;
  source: AppSource;
}

export interface AppApi {
  getInfo(): AppInfo;
  terminate(): void;
  canIUse(capability?: BridgeValue): boolean;
  loadLibrary(libraryName: string): BridgeValue;
}

export interface PromptToastOptions {
  message: string;
  duration?: BridgeValue;
}

export interface PromptDialogResult {
  index: number;
}

export interface PromptDialogOptions {
  title?: string;
  message: string;
  autocancel?: boolean;
  success?: BridgeCallback<[PromptDialogResult]>;
  cancel?: BridgeCallback;
  complete?: BridgeCallback;
}

export interface PromptApi {
  showToast(options: PromptToastOptions): void;
  showDialog(options: PromptDialogOptions): void;
}

export interface FetchOptions {
  url: string;
  data?: BridgeValue;
  header?: BridgeValue;
  method?:
    | "OPTIONS"
    | "GET"
    | "HEAD"
    | "POST"
    | "PUT"
    | "DELETE"
    | "TRACE"
    | "CONNECT"
    | "PATCH"
    | string;
  responseType?: "" | "text" | "json" | "file" | "arraybuffer" | string;
  timeout?: number;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface UploadSuccess {
  data?: BridgeValue;
  statusCode?: number;
  header?: BridgeValue;
  [key: string]: BridgeValue;
}

export interface UploadProgress {
  progress: number;
  totalBytesSent: number;
  totalBytesExpectedToSend: number;
}

export interface UploadFileOptions {
  url: string;
  filePath: string;
  name: string;
  header?: BridgeValue;
  formData?: BridgeValue;
  timeout?: number;
  success?: BridgeCallback<[UploadSuccess]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface UploadTask {
  abort(): void;
  onProgressUpdate(callback: BridgeCallback<[UploadProgress]>): void;
  offProgressUpdate(callback?: BridgeCallback<[UploadProgress]>): void;
}

export interface DownloadNotifyData {
  progress?: number;
  totalBytesWritten?: number;
  totalBytesExpectedToWrite?: number;
  [key: string]: BridgeValue;
}

export interface DownloadSuccess {
  token: string;
  [key: string]: BridgeValue;
}

export interface DownloadCompleteSuccess {
  uri: string;
  [key: string]: BridgeValue;
}

export interface DownloadOptions {
  url: string;
  header?: string;
  filename?: string;
  share?: boolean;
  onDownLoadNotify?: BridgeCallback<[DownloadNotifyData]>;
  success?: BridgeCallback<[DownloadSuccess]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface DownloadCompleteOptions {
  token: string;
  success?: BridgeCallback<[DownloadCompleteSuccess]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface NetworkApi {
  fetch(options: FetchOptions): Promise<BridgeValue>;
  uploadFile(options: UploadFileOptions): UploadTask;
  download(options: DownloadOptions): void;
  onDownloadComplete(options: DownloadCompleteOptions): void;
  getType(options: CallbackOptions<NetworkTypeInfo>): void;
  subscribe(options: {
    callback?: BridgeCallback<[NetworkTypeInfo]>;
    fail?: BridgeFailCallback;
  }): void;
  unsubscribe(): void;
}

export type NetworkType =
  | "2g"
  | "3g"
  | "4g"
  | "5g"
  | "wifi"
  | "bluetooth"
  | "none"
  | "others";

export interface NetworkTypeInfo {
  type: NetworkType | string;
}

export interface StorageGetOptions {
  key: string;
  default?: string;
  success?: BridgeCallback<[string]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback<[string]>;
}

export interface StorageSetOptions {
  key: string;
  value?: string;
  success?: BridgeCallback<[string]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback<[string]>;
}

export interface StorageDeleteOptions {
  key: string;
  success?: BridgeCallback<[string]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback<[string]>;
}

export interface StorageKeyOptions {
  index: number;
  success?: BridgeCallback<[string]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback<[string]>;
}

export interface StorageApi {
  get(options: StorageGetOptions): void;
  set(options: StorageSetOptions): void;
  clear(options?: CallbackOptions<string>): void;
  delete(options: StorageDeleteOptions): void;
  key(options: StorageKeyOptions): void;
  length: number;
}

export interface ExchangeOptions {
  key?: string;
  value?: string;
  scope?: string;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback<[string]>;
}

export interface ExchangeApi {
  set(options: ExchangeOptions & { key: string; value: string }): void;
  get(options: ExchangeOptions & { key: string }): void;
  remove(options: ExchangeOptions & { key: string }): void;
  clear(options?: ExchangeOptions): void;
}

export interface CryptoHashDigestOptions {
  data?: BridgeValue;
  uri?: string;
  algo?: string;
}

export interface CryptoHmacDigestOptions extends CallbackOptions {
  data: string;
  algo?: string;
  key: string;
}

export interface CryptoSignOptions extends CallbackOptions {
  data?: BridgeValue;
  uri?: string;
  algo?: string;
  privateKey: string;
}

export interface CryptoVerifyOptions {
  data?: BridgeValue;
  uri?: string;
  algo?: string;
  signature: BridgeValue;
  publicKey: string;
  success?: BridgeCallback<[boolean]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface CryptoCryptOptions extends CallbackOptions {
  data: BridgeValue;
  algo?: string;
  key: string;
  options?: BridgeValue;
}

export interface CryptoApi {
  hashDigest(options: CryptoHashDigestOptions): string;
  hmacDigest(options: CryptoHmacDigestOptions): void;
  sign(options: CryptoSignOptions): void;
  verify(options: CryptoVerifyOptions): void;
  encrypt(options: CryptoCryptOptions): void;
  decrypt(options: CryptoCryptOptions): void;
  btoa(value: string): string;
  atob(value: string): string;
}

export interface CipherRSAOptions extends CallbackOptions {
  action: string;
  text: string;
  key: string;
  hashType?: string;
}

export interface CipherVerifyOptions extends CallbackOptions {
  text: string;
  key: string;
  hashType?: string;
  signature: string;
}

export interface CipherDigestOptions extends CallbackOptions {
  hashType?: string;
  text: string;
}

export interface CipherMd5Options extends CallbackOptions {
  text: string;
}

export interface CipherAESOptions {
  action: string;
  text: string;
  key: string;
  iv: string;
  ivOffset?: number;
  ivLen?: number;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeCallback<[BridgeValue, number]>;
  complete?: BridgeCallback;
}

export interface CipherApi {
  rsa(options: CipherRSAOptions): void;
  sign(options: CipherRSAOptions): void;
  verify(options: CipherVerifyOptions): void;
  digest(options: CipherDigestOptions): void;
  md5(options: CipherMd5Options): void;
  aes(options: CipherAESOptions): void;
}

export interface ProtobufType {
  verify(message: BridgeValue): boolean;
  encode(message: BridgeValue): BridgeValue;
  decode(buffer: BridgeValue): BridgeValue;
}

export interface ProtobufRoot {
  readonly syntax: string;
  lookupType(typeName: string): ProtobufType;
}

export interface ProtobufLoadOptions {
  filePath?: string;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface ProtobufApi {
  load(options: ProtobufLoadOptions): Promise<{ root: ProtobufRoot }>;
  release(root: ProtobufRoot): boolean;
}

export interface MessageCodecApi {
  verify(value: BridgeValue): boolean;
  decode(value: BridgeValue): BridgeValue;
  encode(value: BridgeValue): BridgeValue;
}

export interface SensorCallbackOptions<T> {
  reserved?: boolean;
  interval?: string;
  callback: BridgeCallback<[T]>;
  fail?: BridgeFailCallback;
}

export interface AccelerometerData {
  x: number;
  y: number;
  z: number;
}

export interface CompassData {
  direction: number;
}

export interface ProximityData {
  distance?: number;
  value?: BridgeValue;
}

export interface LightData {
  intensity?: number;
  value?: BridgeValue;
}

export interface ScalarSensorData {
  value?: number;
  accuracy?: number;
  timestamp?: number;
  [key: string]: BridgeValue;
}

export interface GenericSensorSubscribeOptions {
  type: number;
  reserved?: boolean;
  interval?: string;
  callback: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
}

export interface SensorRecentDataOptions {
  type: number;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface SensorApi {
  subscribeAccelerometer(
    options: SensorCallbackOptions<AccelerometerData>,
  ): void;
  unsubscribeAccelerometer(): void;
  subscribeCompass(options: SensorCallbackOptions<CompassData>): void;
  unsubscribeCompass(): void;
  subscribeProximity(options: SensorCallbackOptions<ProximityData>): void;
  unsubscribeProximity(): void;
  subscribeLight(options: SensorCallbackOptions<LightData>): void;
  unsubscribeLight(): void;
  subscribeStepCounter(options: SensorCallbackOptions<ScalarSensorData>): void;
  unsubscribeStepCounter(): void;
  subscribePressure(options: SensorCallbackOptions<ScalarSensorData>): void;
  unsubscribePressure(): void;
  subscribeHumidity(options: SensorCallbackOptions<ScalarSensorData>): void;
  unsubscribeHumidity(): void;
  subscribeAmbientTemperature(
    options: SensorCallbackOptions<ScalarSensorData>,
  ): void;
  unsubscribeAmbientTemperature(): void;
  DATA_TYPES: BridgeValue;
  subscribe(options: GenericSensorSubscribeOptions): number;
  unsubscribe(subscriptionId: number): void;
  getRecentData(options: SensorRecentDataOptions): void;
  checkAvailable(sensorType: number): boolean;
}

export interface GeolocationOptions {
  timeout?: number;
}

export interface LocationInfo {
  longitude: number;
  latitude: number;
  altitude: number;
  speed: number;
  accuracy: number;
  accuracyInfo: BridgeValue;
}

export interface GeolocationApi {
  getLocation(options?: GeolocationOptions): Promise<LocationInfo>;
  subscribe(options: {
    callback: BridgeCallback<[LocationInfo]>;
    fail?: BridgeFailCallback;
  }): void;
  unsubscribe(): void;
}

export interface VibrateOptions {
  mode?: string;
}

export interface VibrateStartOptions {
  duration?: number;
  interval?: number;
  count?: number;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface VibratorApi {
  vibrate(options?: VibrateOptions): void;
  start(options: VibrateStartOptions): void;
  stop(vibrationId: number): boolean;
  getSystemDefaultMode(): number;
}

export interface FileCallbacks<T = string> {
  success?: BridgeCallback<[T]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface FileMoveOptions extends FileCallbacks {
  srcUri: string;
  dstUri: string;
}

export interface FileListOptions extends FileCallbacks<{
  fileList: BridgeValue[];
}> {
  uri: string;
}

export interface FileGetOptions extends FileCallbacks<BridgeValue> {
  uri: string;
  recursive?: boolean;
}

export interface FileUriOptions extends FileCallbacks<void> {
  uri: string;
}

export interface FileWriteTextOptions extends FileCallbacks<void> {
  uri: string;
  text: string;
  encoding?: string;
  append?: boolean;
}

export interface FileWriteArrayBufferOptions extends FileCallbacks<void> {
  uri: string;
  buffer: BridgeValue;
  position?: number;
  append?: boolean;
}

export interface FileReadTextOptions extends FileCallbacks<BridgeValue> {
  uri: string;
  encoding?: string;
}

export interface FileReadArrayBufferOptions extends FileCallbacks<BridgeValue> {
  uri: string;
  position?: number;
  length?: number;
}

export interface FileMkdirOptions extends FileCallbacks<void> {
  uri: string;
  recursive?: boolean;
}

export interface FileApi {
  move(options: FileMoveOptions): void;
  copy(options: FileMoveOptions): void;
  list(options: FileListOptions): void;
  get(options: FileGetOptions): void;
  delete(options: FileUriOptions): void;
  writeText(options: FileWriteTextOptions): void;
  writeArrayBuffer(options: FileWriteArrayBufferOptions): void;
  readText(options: FileReadTextOptions): void;
  readArrayBuffer(options: FileReadArrayBufferOptions): void;
  access(options: FileUriOptions): void;
  mkdir(options: FileMkdirOptions): void;
  rmdir(options: FileMkdirOptions): void;
}

export interface ZipApi {
  decompress(options: {
    srcUri: string;
    dstUri: string;
    success?: BridgeCallback;
    fail?: BridgeFailCallback;
    complete?: BridgeCallback;
  }): void;
}

export interface ZlibApi {
  decompressSync(compressedData: BridgeValue): BridgeValue;
}

export interface ServiceClientConnectOptions {
  name: string;
  package?: string;
  params?: BridgeValue;
  policy?: string;
}

export interface ServiceInstance {
  postMessage(message: BridgeValue): void;
  disconnect(): void;
  onmessage(callback: BridgeCallback<[string]>): void;
  onerror(callback: BridgeCallback<[number]>): void;
}

export interface ServiceClientApi {
  connect(options: ServiceClientConnectOptions): ServiceInstance;
}

export interface SystemEventApi {
  publish(options: { eventName: string; options?: BridgeValue }): void;
  subscribe(options: {
    eventName: string;
    callback: BridgeCallback<[BridgeValue]>;
  }): BridgeValue;
  unsubscribe(options: { id: number }): void;
}

export interface DeviceInfo {
  brand?: string;
  manufacturer?: string;
  model?: string;
  product?: string;
  osType?: string;
  osVersionName?: string;
  osVersionCode?: number;
  platformVersionName?: string;
  platformVersionCode?: number;
  screenWidth?: number;
  screenHeight?: number;
  windowWidth?: number;
  windowHeight?: number;
  statusBarHeight?: number;
  [key: string]: BridgeValue;
}

export interface DeviceCommonOptions extends CallbackOptions {}

export interface DeviceApi {
  getInfo(options: CallbackOptions<DeviceInfo>): void;
  getSystemUptime(): Promise<{ systemUptime: number }>;
  getDeviceId(options?: DeviceCommonOptions): string;
  getId(options: DeviceCommonOptions): void;
  getSerial(options: DeviceCommonOptions): void;
  getTotalStorage(options: DeviceCommonOptions): void;
  getAvailableStorage(options: DeviceCommonOptions): void;
}

export interface FolmeAnimationOptions {
  id: string;
  fromState?: BridgeValue;
  toState?: BridgeValue;
  config?: BridgeValue;
  onUpdate?: BridgeCallback;
  onComplete?: BridgeCallback;
}

export interface FolmeApi {
  to(options: Omit<FolmeAnimationOptions, "fromState">): void;
  setTo(
    options: Omit<
      FolmeAnimationOptions,
      "fromState" | "onUpdate" | "onComplete"
    >,
  ): void;
  fromTo(options: FolmeAnimationOptions): void;
  startGroup(options: FolmeAnimationOptions[]): void;
  cancel(options: { id: string; attrs?: BridgeValue }): void;
  getState(options: { id: string; attr: string }): {
    value: string;
    isFinished: boolean;
    speed: number;
  };
}

export interface VolumeValue {
  value: number;
}

export interface VolumeApi {
  onMediaValueChanged(callback: BridgeCallback<[VolumeValue]>): void;
  setMediaValue(options: {
    value: number;
    success?: BridgeCallback<[VolumeValue]>;
    fail?: BridgeFailCallback;
    complete?: BridgeCallback<[string]>;
  }): void;
  getMediaValue(options: {
    success?: BridgeCallback<[VolumeValue]>;
    fail?: BridgeFailCallback;
    complete?: BridgeCallback<[string]>;
  }): void;
}

export interface AudioMetaInfo {
  title?: string;
  album?: string;
  artist?: string;
  [key: string]: BridgeValue;
}

export interface AudioState {
  state?: string;
  currentTime?: number;
  duration?: number;
  [key: string]: BridgeValue;
}

export interface AudioApi {
  src: string;
  meta: AudioMetaInfo;
  currentTime: number;
  readonly duration: number;
  autoplay: boolean;
  loop: boolean;
  volume: number;
  muted: boolean;
  readonly streamType: string;
  readonly percent: number;
  play(): void;
  pause(): void;
  stop(): void;
  getPlayState(options: CallbackOptions<AudioState>): void;
  onplay?: BridgeCallback;
  onpause?: BridgeCallback;
  onstop?: BridgeCallback;
  onloadeddata?: BridgeCallback;
  onended?: BridgeCallback;
  ondurationchange?: BridgeCallback;
  ontimeupdate?: BridgeCallback;
  onerror?: BridgeCallback;
  onctrlplayprev?: BridgeCallback;
  onctrlplaynext?: BridgeCallback;
}

export interface MediaSessionFeedback {
  success?: BridgeCallback<[string]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface MediaSession {
  start(options: MediaSessionFeedback): void;
  pause(options: MediaSessionFeedback): void;
  stop(options: MediaSessionFeedback): void;
  prev(options: MediaSessionFeedback): void;
  next(options: MediaSessionFeedback): void;
  increaseVolume(options: MediaSessionFeedback): void;
  decreaseVolume(options: MediaSessionFeedback): void;
  onEvent?: BridgeCallback<[string]>;
}

export interface MediaSessionApi {
  createSession(name: string): MediaSession;
}

export interface RecordStartOptions {
  duration?: number;
  sampleRate?: number;
  numberOfChannels?: number;
  encodeBitRate?: number;
  frameSize?: number;
  format?: string;
  success?: BridgeCallback<[BridgeValue]>;
  fail?: BridgeFailCallback;
  complete?: BridgeCallback;
}

export interface RecordApi {
  onframerecorded(callback: BridgeCallback<[BridgeValue]>): void;
  start(options: RecordStartOptions): void;
  stop(): void;
}

export interface DebugApi {
  enable(): Promise<number>;
  disable(): Promise<number>;
  getStatus(): Promise<number>;
}

export interface PowerApi {
  shutDown(options?: CallbackOptions<string>): void;
  reboot(options?: CallbackOptions<string>): void;
}

export interface PackageInfo {
  packageName: string;
  name: string;
  icon: string;
  installedPath: string;
  manifest: string;
  appType: string;
  version: string;
  installTime: string;
  appSize?: number;
  extra?: string;
}

export interface PackageApi {
  getAllPackageInfo(): PackageInfo[];
  getPackageInfo(packageName: string): PackageInfo;
  clearAppCache(packageName: string): number;
  installPackage(options: {
    path: string;
    isForce?: boolean;
    progress?: BridgeCallback<[string, number]>;
    result?: BridgeCallback<[string, number, string]>;
  }): void;
  uninstallPackage(options: {
    packageName: string;
    isClearCache?: boolean;
    result?: BridgeCallback<[string, number, string]>;
  }): void;
}

export interface ActivityApi {
  startActivity(abilityName: string, params?: BridgeValue): number;
  stopActivity(abilityName: string): number;
  startService(serviceName: string, params?: BridgeValue): number;
  stopService(serviceName: string): number;
  bindService(
    serviceName: string,
    params: BridgeValue,
    connection: {
      connectCallBack: BridgeCallback;
      disconnectCallBack: BridgeCallback;
    },
  ): number;
  unbindService(connectionId: number): void;
  moveToBackground(enabled: boolean): boolean;
}

export interface MessageChannelApi {
  sendMessage(target: string, message: string): Promise<string>;
  reply(requestId: number, message: string): void;
  setReceiveRequestCallback(
    topic: string,
    callback: BridgeCallback<[number, string]>,
  ): void;
  notifyMessage(topic: string, message: string): void;
  setTopicListener(
    topic: string,
    callback: BridgeCallback<[string, string]>,
  ): void;
  unsetTopicListener(topic: string): void;
  unsetTopicListenerCb(
    topic: string,
    callback: BridgeCallback<[string, string]>,
  ): void;
  createSession(peer: string): Promise<number>;
  sessionSend(sessionId: number, message: string): void;
  sessionClose(sessionId: number): void;
  acceptSession(sessionId: number): void;
  sessionOnData(sessionId: number, callback: BridgeCallback<[string]>): void;
  readonly SESSION_REASON_CLOSE: 0;
  readonly SESSION_REASON_CLOSE_PEER: 1;
  readonly SESSION_REASON_PEER_SHUTDOWN: 2;
  sessionOnClose(sessionId: number, callback: BridgeCallback<[number]>): void;
  sessionOnReceive(
    topic: string,
    callback: BridgeCallback<[number, string]>,
  ): void;
  print(message: string): void;
}

export interface InterconnectReadyState {
  status: 1 | 2 | number;
}

export interface InterconnectDiagnosisResult {
  status: 0 | 204 | 1000 | 1001 | number;
}

export interface InterconnectError {
  data?: string;
  code?: number;
  [key: string]: BridgeValue;
}

export interface InterconnectMessage {
  data?: BridgeValue;
  status?: number;
  isReconnected?: boolean;
  code?: number;
  [key: string]: BridgeValue;
}

export interface InterconnectConnect {
  getReadyState(options?: {
    success?: BridgeCallback<[InterconnectReadyState]>;
    fail?: BridgeCallback<[string | InterconnectError, number]>;
  }): void;
  diagnosis(options?: {
    timeout?: number;
    success?: BridgeCallback<[InterconnectDiagnosisResult]>;
    fail?: BridgeCallback<[string | InterconnectError, number]>;
  }): void;
  send(options: {
    data: Record<string, BridgeValue>;
    success?: BridgeCallback;
    fail?: BridgeCallback<[string | InterconnectError, number]>;
  }): void;
  onmessage?: BridgeCallback<[InterconnectMessage]>;
  onopen?: BridgeCallback<[InterconnectMessage]>;
  onclose?: BridgeCallback<[InterconnectMessage]>;
  onerror?: BridgeCallback<[InterconnectMessage]>;
}

export interface InterconnectApi {
  instance(): InterconnectConnect;
}

export interface BatteryStatus {
  charging: boolean;
  level: number;
}

export interface BatteryApi {
  getStatus(options?: CallbackOptions<BatteryStatus>): void;
}

export interface BrightnessValue {
  value: number;
}

export interface BrightnessMode {
  mode: 0 | 1 | number;
}

export interface BrightnessApi {
  getValue(options?: CallbackOptions<BrightnessValue>): void;
  setValue(options: { value: number } & CallbackOptions<void>): void;
  getMode(options?: CallbackOptions<BrightnessMode>): void;
  setMode(options: { mode: 0 | 1 | number } & CallbackOptions<void>): void;
  setKeepScreenOn(
    options: { keepScreenOn: boolean } & CallbackOptions<void>,
  ): void;
}

export type BLEAddressType = "PUBLIC" | "RANDOM" | "ANONYMOUS" | "UNKNOWN";

export interface BLEScanFilter {
  deviceId?: string;
  name?: string;
  serviceUuid?: string;
}

export interface BLEScanOptions {
  dutyMode?: number;
}

export interface BLEScanResult {
  deviceId: string;
  name?: string;
  serviceUuid?: string;
  rssi?: number;
  addressType?: BLEAddressType | string;
  [key: string]: BridgeValue;
}

export interface BLEStartScanOptions extends CallbackOptions<void> {
  filters: BLEScanFilter[];
  options?: BLEScanOptions;
}

export interface BLEScanStateResult {
  scanState: number;
}

export interface BLEScanner {
  startBLEScan(options: BLEStartScanOptions): void;
  stopBLEScan(): void;
  getScanState(options?: CallbackOptions<BLEScanStateResult>): void;
  subscribeBLEDeviceFind(options?: {
    callback?: BridgeCallback<[BLEScanResult[]]>;
    fail?: BridgeFailCallback;
  }): number;
  unsubscribeBLEDeviceFind(subscribeId: number): void;
  close(): void;
}

export interface BLEGattService {
  uuid?: string;
  isPrimary?: boolean;
  [key: string]: BridgeValue;
}

export interface BLEGattCharacteristic {
  serviceUuid?: string;
  characteristicUuid?: string;
  value?: BridgeValue;
  properties?: BridgeValue;
  [key: string]: BridgeValue;
}

export interface BLEGattDescriptor {
  serviceUuid?: string;
  characteristicUuid?: string;
  descriptorUuid?: string;
  value?: BridgeValue;
  [key: string]: BridgeValue;
}

export interface BLEGattOptions<T = void> extends CallbackOptions<T> {
  serviceUuid?: string;
  characteristicUuid?: string;
  descriptorUuid?: string;
  value?: BridgeValue;
  mtu?: number;
  enable?: boolean;
}

export interface BLEGattClientDevice {
  connect(options?: CallbackOptions<void>): void;
  disconnect(options?: CallbackOptions<void>): void;
  close(): void;
  getServices(options?: CallbackOptions<{ services: BLEGattService[] }>): void;
  readCharacteristicValue(
    options: BLEGattOptions<{ characteristic: BLEGattCharacteristic }>,
  ): void;
  readDescriptorValue(
    options: BLEGattOptions<{ descriptor: BLEGattDescriptor }>,
  ): void;
  writeCharacteristicValue(options: BLEGattOptions<void>): void;
  writeDescriptorValue(options: BLEGattOptions<void>): void;
  setBLEMtuSize(options: BLEGattOptions<void>): void;
  setNotifyCharacteristicChanged(options: BLEGattOptions<void>): void;
  getDeviceName(options?: CallbackOptions<{ name: string }>): void;
  getRssiValue(options?: CallbackOptions<{ rssi: number }>): void;
  onBLECharacteristicChange?: BridgeCallback<[BLEGattCharacteristic]>;
  onBLEConnectionStateChange?: BridgeCallback<[BridgeValue]>;
}

export interface BluetoothBLEApi {
  createScanner(): BLEScanner;
  createGattClientDevice(
    deviceId: string,
    addressType?: BLEAddressType,
  ): BLEGattClientDevice;
}

export const ScanDuty = {
  SCAN_MODE_LOW_POWER: 0,
  SCAN_MODE_BALANCED: 1,
  SCAN_MODE_LOW_LATENCY: 2,
} as const;

export const ScanState = {
  STATE_NON_SCAN: 0,
  STATE_SCANING: 1,
} as const;

export interface JumpAppApi {
  jumpApp(packageName: string, paramsOrPath?: string): void;
  launchQuickApp(packageName: string): void;
}

export interface VelaApi {
  locale: { get(): LocaleInfo };
  exchange: ExchangeApi;
  crypto: CryptoApi;
  configuration: { getLocale(): LocaleInfo };
  zlib: ZlibApi;
  serviceclient: ServiceClientApi;
  event: SystemEventApi;
  folme: FolmeApi;
  volume: VolumeApi;
  mediaSession: MediaSessionApi;
  protobuf: ProtobufApi;
  mqttmessage: MessageCodecApi;
  debug: DebugApi;
  interconnect: InterconnectApi;
  battery: BatteryApi;
  brightness: BrightnessApi;
  bluetoothBLE: BluetoothBLEApi;
  jumpApp: JumpAppApi;
  internals: VelaInternalsApi;
}

export interface SystemApi {
  app: AppApi;
  prompt: PromptApi;
  router: RouterApi;
  storage: StorageApi;
  network: NetworkApi;
  cipher: CipherApi;
  sensor: SensorApi;
  geolocation: GeolocationApi;
  vibrator: VibratorApi;
  file: FileApi;
  zip: ZipApi;
  device: DeviceApi;
  audio: AudioApi;
  record: RecordApi;
  vela: VelaApi;
}

export interface VelaInternalsApi {
  power: PowerApi;
  package: PackageApi;
  activity: ActivityApi;
  messageChannel: MessageChannelApi;
}

const NOT_REACHABLE =
  "AstroForge: 系统 API 仅可在设备运行时使用。请确认当前代码已进入目标平台 bridge。";

function feature<T>(_name: string): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return undefined;
        return () => {
          throw new Error(NOT_REACHABLE);
        };
      },
      set() {
        throw new Error(NOT_REACHABLE);
      },
    },
  ) as T;
}

export const router = feature<RouterApi>("system.router");
export const app = feature<AppApi>("system.app");
export const prompt = feature<PromptApi>("system.prompt");
export const network = feature<NetworkApi>("network");
export const storage = feature<StorageApi>("system.storage");
export const cipher = feature<CipherApi>("system.cipher");
export const sensor = feature<SensorApi>("system.sensor");
export const geolocation = feature<GeolocationApi>("system.geolocation");
export const vibrator = feature<VibratorApi>("system.vibrator");
export const file = feature<FileApi>("system.file");
export const zip = feature<ZipApi>("system.zip");
export const device = feature<DeviceApi>("system.device");
export const audio = feature<AudioApi>("system.audio");
export const record = feature<RecordApi>("system.record");
export const velaLocale = feature<{ get(): LocaleInfo }>("locale");
export const velaExchange = feature<ExchangeApi>("system.exchange");
export const velaCrypto = feature<CryptoApi>("system.crypto");
export const velaConfiguration = feature<{ getLocale(): LocaleInfo }>(
  "system.configuration",
);
export const velaZlib = feature<ZlibApi>("system.zlib");
export const velaServiceClient = feature<ServiceClientApi>(
  "system.serviceclient",
);
export const velaEvent = feature<SystemEventApi>("system.event");
export const velaFolme = feature<FolmeApi>("system.folme");
export const velaVolume = feature<VolumeApi>("system.volume");
export const velaMediaSession = feature<MediaSessionApi>(
  "system.media.session",
);
export const velaProtobuf = feature<ProtobufApi>("system.protobuf");
export const velaMqttMessage = feature<MessageCodecApi>("system.mqttmessage");
export const velaDebug = feature<DebugApi>("system.debug");
export const velaInterconnect = feature<InterconnectApi>(
  "system.interconnect",
);
export const velaBattery = feature<BatteryApi>("system.battery");
export const velaBrightness = feature<BrightnessApi>("system.brightness");
export const velaBluetoothBLE = feature<BluetoothBLEApi>(
  "system.bluetooth.ble",
);
export const velaJumpApp = feature<JumpAppApi>("jumpApp");

export const velaInternals: VelaInternalsApi = {
  power: feature<PowerApi>("system.internal.power"),
  package: feature<PackageApi>("system.internal.package"),
  activity: feature<ActivityApi>("system.internal.activity"),
  messageChannel: feature<MessageChannelApi>("system.messageChannel"),
};

export const VelaInternals = velaInternals;

export const vela: VelaApi = {
  locale: velaLocale,
  exchange: velaExchange,
  crypto: velaCrypto,
  configuration: velaConfiguration,
  zlib: velaZlib,
  serviceclient: velaServiceClient,
  event: velaEvent,
  folme: velaFolme,
  volume: velaVolume,
  mediaSession: velaMediaSession,
  protobuf: velaProtobuf,
  mqttmessage: velaMqttMessage,
  debug: velaDebug,
  interconnect: velaInterconnect,
  battery: velaBattery,
  brightness: velaBrightness,
  bluetoothBLE: velaBluetoothBLE,
  jumpApp: velaJumpApp,
  internals: velaInternals,
};

export const system: SystemApi = {
  app,
  prompt,
  router,
  storage,
  network,
  cipher,
  sensor,
  geolocation,
  vibrator,
  file,
  zip,
  device,
  audio,
  record,
  vela,
};
