package org.entermediadb.mediaboat;

import java.io.StringReader;
import java.net.URI;
import java.util.List;
import java.util.Map;

import org.json.simple.JSONObject;
import org.json.simple.parser.JSONParser;

import com.neovisionaries.ws.client.ThreadType;
import com.neovisionaries.ws.client.WebSocket;
import com.neovisionaries.ws.client.WebSocketException;
import com.neovisionaries.ws.client.WebSocketFactory;
import com.neovisionaries.ws.client.WebSocketFrame;
import com.neovisionaries.ws.client.WebSocketListener;
import com.neovisionaries.ws.client.WebSocketState;


public class WsConnection implements WebSocketListener
{
    protected ThreadLocal perThreadCache = new ThreadLocal();

    AppController	 fieldController;
    protected boolean disconnect = false;
    protected boolean autoreconnect = false;
    protected URI uri;
    WebSocket socket;
    
    public WsConnection(URI inServerUri)
	{
		uri = inServerUri;
	}
	public AppController getAppController()
	{
		return fieldController;
	}

	public void setAppController(AppController inModel)
	{
		fieldController = inModel;
	}
	
	

	public boolean connect()
	{
		WebSocketFactory factory = new WebSocketFactory()
		          ;//  .setConnectionTimeout(TIMEOUT);
		try
		{
			socket = factory.createSocket(uri);
	
			socket.addListener(this);
			socket.connect();
			socket.setPingInterval(30000); //Every 30 seconds
			return true;
		}
		catch(Throwable ex)
		{
			getAppController().reportError("Could not connect", ex);
		}
		return false;

	}
	
	
	public JSONParser getJSONParser()
	{
		JSONParser jSONParser = (JSONParser)perThreadCache.get();
		if (jSONParser == null) 
		{
			jSONParser = new JSONParser();
			perThreadCache.set(jSONParser);
		}
		return jSONParser;
	}

	public void send(Message inMes)
	{
		getAppController().debug("sent " + inMes.getCommand() );

		JSONObject object = new JSONObject(inMes);
		object.put("connectionid", String.valueOf(hashCode()));
		String text = object.toJSONString();
		send(text);
	}


	private void send(String inText)
	{
		socket.sendText(inText);
	}

	@Override
	public void onTextMessage(WebSocket inWebsocket, String inMessage) throws Exception
	{
		if( disconnect )
		{
			getAppController().info("disconnected");
			return;
		}
		getAppController().onTextMessage(inWebsocket, inMessage);
	}

	public void disconnect()
	{
		// TODO Auto-generated method stub
		disconnect = true;
		socket.disconnect();
	}
	@Override
	public void onStateChanged(WebSocket inWebsocket, WebSocketState inNewState) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onConnected(WebSocket inWebsocket, Map<String, List<String>> inHeaders) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onConnectError(WebSocket inWebsocket, WebSocketException inCause) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onDisconnected(WebSocket inWebsocket, WebSocketFrame inServerCloseFrame, WebSocketFrame inClientCloseFrame, boolean inClosedByServer) throws Exception
	{
		if( !disconnect )
		{
			getAppController().reconnect();
		}

	}
	@Override
	public void onFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onContinuationFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onTextFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onBinaryFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onCloseFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onPingFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		//getAppController().info("Ping received");
	}
	@Override
	public void onPongFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
	//	getAppController().info("Pong received");
		
	}
	@Override
	public void onBinaryMessage(WebSocket inWebsocket, byte[] inBinary) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onSendingFrame(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onFrameSent(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onFrameUnsent(WebSocket inWebsocket, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onThreadCreated(WebSocket inWebsocket, ThreadType inThreadType, Thread inThread) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onThreadStarted(WebSocket inWebsocket, ThreadType inThreadType, Thread inThread) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onThreadStopping(WebSocket inWebsocket, ThreadType inThreadType, Thread inThread) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onError(WebSocket inWebsocket, WebSocketException inCause) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onFrameError(WebSocket inWebsocket, WebSocketException inCause, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onMessageError(WebSocket inWebsocket, WebSocketException inCause, List<WebSocketFrame> inFrames) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onMessageDecompressionError(WebSocket inWebsocket, WebSocketException inCause, byte[] inCompressed) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onTextMessageError(WebSocket inWebsocket, WebSocketException inCause, byte[] inData) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onSendError(WebSocket inWebsocket, WebSocketException inCause, WebSocketFrame inFrame) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onUnexpectedError(WebSocket inWebsocket, WebSocketException inCause) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void handleCallbackError(WebSocket inWebsocket, Throwable inCause) throws Exception
	{
		// TODO Auto-generated method stub
		
	}
	@Override
	public void onSendingHandshake(WebSocket inWebsocket, String inRequestLine, List<String[]> inHeaders) throws Exception
	{
		// TODO Auto-generated method stub
		
	}

}
