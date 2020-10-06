---
layout: post
title:  우분투에서 node.js 설치
date:   2020-10-06 16:00:00 +0900
image:  ubuntu+node.jpg
tags:   서버, nodejs
---

우분투 환경을 자주 사용하는데, 매번 새로운 환경에서 node.js 를 설치할 때 마다.. 찾아보는 것 같습니다.

버전마다 다른데, 저는 주로 LTS 버전을 이용하기 때문에 Node.js LTS 를 설치했습니다. 

(참고, 테스트 환경 - Ubuntu 16.04, 18.04, 20.04) <br> 


### **Node.js LTS 버전 (v12.x)**:

```bash
curl -sL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```
<br>

### **Node.js v14.x**:

```bash
curl -sL https://deb.nodesource.com/setup_14.x | sudo -E bash -
sudo apt-get install -y nodejs
```
<br>

### **Node.js v12.x**:

```bash
curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
sudo apt-get install -y nodejs
```
<br>

### **Node.js v10.x**:

```bash
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs
```
<br>

## **Node.js 최신버전 (v14.x)**:

```bash
curl -sL https://deb.nodesource.com/setup_current.x | sudo -E bash -
sudo apt-get install -y nodejs
```
<br>

#### ***선택사항***: 빌드 툴 설치하기

npm에서 네이티브 addon들을 컴파일하고 설치하기 위해서, 빌드 도구를 설치 할 수 도 있습니다. 아래 커멘드를 참고하세요.

```bash
apt-get install -y build-essential
```
<br>

---
## References

* **NodeSource Node.js Binary Distributions** (https://github.com/nodesource/distributions/blob/master/README.md)